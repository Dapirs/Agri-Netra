import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getHistory, saveResult, clearHistory } from './historyStore.js';

// Must match STORAGE_KEY in historyStore.js (only used to seed bad data).
const KEY = 'plantapp_history';

let store;

beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('getHistory', () => {
    it('returns an empty list when nothing is stored', () => {
        expect(getHistory()).toEqual([]);
    });

    it('returns an empty list when the stored data is corrupt', () => {
        store[KEY] = '{not valid json';
        expect(getHistory()).toEqual([]);
    });

    it('returns an empty list when the stored data is not an array', () => {
        store[KEY] = JSON.stringify({ a: 1 });
        expect(getHistory()).toEqual([]);
    });
});

describe('saveResult', () => {
    it('stores the result with an id and an ISO timestamp, and returns it', () => {
        const entry = saveResult({ type: 'scan', disease: 'Late blight' });

        expect(entry).toMatchObject({ type: 'scan', disease: 'Late blight' });
        expect(typeof entry.id).toBe('string');
        expect(entry.id.length).toBeGreaterThan(0);
        expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
        expect(getHistory()).toEqual([entry]);
    });

    it('gives every entry a different id', () => {
        const a = saveResult({ n: 1 });
        const b = saveResult({ n: 2 });
        expect(a.id).not.toBe(b.id);
    });

    it('still produces an id when crypto.randomUUID is unavailable', () => {
        vi.stubGlobal('crypto', {});
        const entry = saveResult({ n: 1 });
        expect(entry.id).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('keeps only the 20 most recent entries, oldest dropped first', () => {
        for (let n = 0; n < 25; n++) saveResult({ n });

        const history = getHistory();
        expect(history).toHaveLength(20);
        expect(history[0].n).toBe(5);
        expect(history[19].n).toBe(24);
    });

    it('keeps the newest half when storage is full on the first attempt', () => {
        for (let n = 0; n < 20; n++) saveResult({ n });

        const real = localStorage.setItem;
        let calls = 0;
        localStorage.setItem = (k, v) => {
            calls += 1;
            if (calls === 1) throw new DOMException('quota', 'QuotaExceededError');
            real(k, v);
        };

        const entry = saveResult({ n: 20 });

        const history = getHistory();
        expect(history).toHaveLength(10);
        expect(history[history.length - 1].id).toBe(entry.id);
    });

    it('does not throw, and still returns the entry, when storage is still full after trimming', () => {
        for (let n = 0; n < 20; n++) saveResult({ n });
        localStorage.setItem = () => {
            throw new DOMException('quota', 'QuotaExceededError');
        };

        let entry;
        expect(() => {
            entry = saveResult({ n: 20 });
        }).not.toThrow();
        expect(entry).toMatchObject({ n: 20 });
        expect(typeof entry.id).toBe('string');
    });

    it('does not throw when the browser blocks storage entirely', () => {
        localStorage.setItem = () => {
            throw new DOMException('denied', 'SecurityError');
        };

        expect(() => saveResult({ n: 1 })).not.toThrow();
    });

    it.todo('stores a compact entry instead of the full treatment text and top-5 list');
});

describe('clearHistory', () => {
    it('removes all saved entries', () => {
        saveResult({ n: 1 });
        clearHistory();
        expect(getHistory()).toEqual([]);
    });
});
