import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DISEASE_LABELS } from '../data/diseaseLabels.js';

// The real class list shipped with the model (index -> label).
const CLASS_INDICES = JSON.parse(
    readFileSync(new URL('../../public/model/class_indices.json', import.meta.url), 'utf8')
);
const LABELS = Object.entries(CLASS_INDICES)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, label]) => label);

const NO_TREATMENT = 'No treatment data available.';
const NO_PREVENTION = 'No prevention data available.';

/** A softmax-like array: `confidence` at `index`, the rest spread evenly. */
const probs = (index, confidence, n = LABELS.length) =>
    Array.from({ length: n }, (_, i) => (i === index ? confidence : (1 - confidence) / (n - 1)));

const indexOfLabel = (label) => LABELS.indexOf(label);

const okJson = (body) => ({ ok: true, json: async () => body });

// The mapper keeps its label list in module state, so load a fresh copy per test.
let mapper;
beforeEach(async () => {
    vi.resetModules();
    mapper = await import('./predictionMapper.js');
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const loadModelLabels = async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson(CLASS_INDICES)));
    await mapper.initializePredictionLabels();
};

describe('initializePredictionLabels', () => {
    it('loads the label list from /model/class_indices.json in index order', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okJson(CLASS_INDICES));
        vi.stubGlobal('fetch', fetchMock);

        await mapper.initializePredictionLabels();

        expect(fetchMock).toHaveBeenCalledWith('/model/class_indices.json');
        const last = LABELS.length - 1;
        expect(mapper.mapPrediction(0, probs(0, 0.9)).topK[0].label).toBe(LABELS[0]);
        expect(mapper.mapPrediction(last, probs(last, 0.9)).topK[0].label).toBe(LABELS[last]);
    });

    it('keeps working with the built-in labels when the request fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

        await mapper.initializePredictionLabels();

        expect(() => mapper.mapPrediction(0, probs(0, 0.9))).not.toThrow();
        expect(console.error).toHaveBeenCalled();
    });

    it('keeps the built-in labels when the file has no usable entries', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({})));

        await mapper.initializePredictionLabels();

        expect(() => mapper.mapPrediction(0, probs(0, 0.9))).not.toThrow();
    });

    it('accepts a different label list when its indices run 0..n-1 without gaps', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ 0: 'A___x', 1: 'B___y', 2: 'C___z' })));

        await mapper.initializePredictionLabels();

        expect(mapper.mapPrediction(1, [0.1, 0.8, 0.1]).topK[0].label).toBe('B___y');
    });

    it('rejects a label file with a gap in its indices and keeps the built-in labels', async () => {
        // Without this check, 'C___z' would silently move from class 2 to class 1.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ 0: 'A___x', 2: 'C___z' })));

        await mapper.initializePredictionLabels();

        expect(mapper.mapPrediction(0, probs(0, 0.9)).topK[0].label).toBe(LABELS[0]);
        expect(console.error).toHaveBeenCalled();
    });
});

describe('built-in fallback labels', () => {
    it('are exactly the model classes, same names and same order', () => {
        expect(DISEASE_LABELS).toEqual(LABELS);
    });

    // The symptom users saw: with the label file unavailable, some crops lost their advice.
    it.each(LABELS.map((label, i) => [label, i]))(
        'still give treatment advice for %s when class_indices.json cannot be loaded',
        async (_label, i) => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
            await mapper.initializePredictionLabels();

            const r = mapper.mapPrediction(i, probs(i, 0.9));

            expect(r.treatment[0]).not.toBe(NO_TREATMENT);
        }
    );
});

describe('mapPrediction', () => {
    beforeEach(loadModelLabels);

    it('maps a disease prediction to readable fields and treatment advice', async () => {
        const i = indexOfLabel('Tomato___Late_blight');
        const r = mapper.mapPrediction(i, probs(i, 0.93));

        expect(r.crop).toBe('Tomato');
        expect(r.disease).toBeTruthy();
        expect(r.displayName).toBe(r.disease);
        expect(r.treatment.length).toBeGreaterThan(0);
        expect(r.treatment[0]).not.toBe(NO_TREATMENT);
        expect(r.prevention[0]).not.toBe(NO_PREVENTION);
        expect(r.confidence).toBe(0.93);
    });

    it('treats a "healthy" class as healthy', () => {
        const i = indexOfLabel('Tomato___healthy');
        expect(mapper.mapPrediction(i, probs(i, 0.97)).severity).toBe('None');
    });

    it('returns the five most likely classes, highest first, with the winner on top', () => {
        const i = indexOfLabel('Tomato___Late_blight');
        const { topK } = mapper.mapPrediction(i, probs(i, 0.8));

        expect(topK).toHaveLength(5);
        expect(topK[0].label).toBe('Tomato___Late_blight');
        for (let k = 1; k < topK.length; k++) {
            expect(topK[k - 1].probability).toBeGreaterThanOrEqual(topK[k].probability);
        }
    });

    it('rounds confidence to four decimal places', () => {
        const p = probs(3, 0.123456789);
        expect(mapper.mapPrediction(3, p).confidence).toBe(0.1235);
    });

    it('rejects a class index outside the label list', () => {
        expect(() => mapper.mapPrediction(-1, probs(0, 0.9))).toThrow(RangeError);
        expect(() => mapper.mapPrediction(LABELS.length, probs(0, 0.9))).toThrow(RangeError);
    });

    it('still returns a result when no probability array is given', () => {
        const r = mapper.mapPrediction(0);
        expect(r.confidence).toBe(0);
        expect(r.topK).toHaveLength(1);
        expect(r.topK[0].label).toBe(LABELS[0]);
    });

    // Data contract: the model can output any of its classes, so the app must have
    // advice for every one of them. Catches a class added/renamed without data.
    it.each(LABELS.map((label, i) => [label, i]))(
        'has treatment and prevention data for model class %s',
        (_label, i) => {
            const r = mapper.mapPrediction(i, probs(i, 0.9));
            expect(r.displayName).toBeTruthy();
            expect(r.treatment[0]).not.toBe(NO_TREATMENT);
            expect(r.prevention[0]).not.toBe(NO_PREVENTION);
        }
    );

    it.each([[NaN], [1.5], [undefined], ['3'], [null]])(
        'rejects %p as a class index',
        (bad) => {
            expect(() => mapper.mapPrediction(bad, probs(0, 0.9))).toThrow(RangeError);
        }
    );

    it('rejects a probability array that is too short or too long for the label list', () => {
        expect(() => mapper.mapPrediction(0, probs(0, 0.9, LABELS.length - 1))).toThrow(/out of sync/);
        expect(() => mapper.mapPrediction(0, probs(0, 0.9, LABELS.length + 1))).toThrow(/out of sync/);
    });

    it('accepts typed arrays such as the Float32Array a TensorFlow.js model returns', () => {
        const typed = Float32Array.from(probs(2, 0.9));
        expect(mapper.mapPrediction(2, typed).topK[0].label).toBe(LABELS[2]);
    });

    it.todo('derives severity from disease progress, not from model confidence');
});
