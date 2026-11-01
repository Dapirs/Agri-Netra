import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { planIrrigation } from './irrigationPlanner.js';
import { calculateET0 } from './et0Calculator.js';

const LAT = 28.6139;
const LON = 77.209;
const WIND = 2.5; // m/s at 10 m, as OpenWeatherMap reports it

const owm = (clouds = 25) => ({
    main: { temp: 30, humidity: 50 },
    wind: { speed: WIND },
    clouds: { all: clouds },
});
const okResponse = (body) => ({ ok: true, json: async () => body });

const plan = (overrides = {}) =>
    planIrrigation({
        crop: 'Tomato',
        stage: 'flowering',
        soilMoisture: 0.2,
        lat: LAT,
        lon: LON,
        ...overrides,
    });

beforeEach(() => {
    const store = {};
    vi.stubGlobal('localStorage', {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(owm())));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10, 12, 0, 0)); // day 100
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('planIrrigation: pipeline', () => {
    it('produces a plausible ET0, Kc and crop water use for tomato at flowering', async () => {
        const p = await plan();

        expect(p.et0).toBeGreaterThan(4);
        expect(p.et0).toBeLessThan(8);
        expect(p.kc).toBe(1.15);
        expect(p.etc).toBeCloseTo(p.et0 * 1.15, 1);
    });

    it('does not claim an irrigation depth, which would need the soil type and root depth', async () => {
        const p = await plan();

        expect(p).not.toHaveProperty('water_needed_mm');
    });

    it('converts 10 m wind to 2 m for ET0 but reports the raw reading', async () => {
        const p = await plan();

        const expected = calculateET0({
            temp_c: 30,
            humidity: 50,
            wind_ms: WIND * 0.748,
            solar_rad: p.weather.solar_rad,
            elevation: 0,
            doy: 100,
            lat: LAT,
        });
        expect(p.et0).toBe(expected);
        expect(p.weather.wind_ms).toBe(WIND);
    });

    it('flags cached weather when the network fails after a successful call', async () => {
        const live = await plan();
        expect(live.weather_cached).toBe(false);

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        const cached = await plan();

        expect(cached.weather_cached).toBe(true);
        expect(cached.et0).toBe(live.et0);
    });
});

describe('planIrrigation: crop and stage', () => {
    // The irrigation form sends capitalised stage names ('Early' | 'Mid' | 'Late').
    it.each([
        ['Early', 0.6],
        ['Mid', 1.15],
        ['Late', 0.8],
    ])('maps the form stage "%s" to the tomato Kc %s', async (stage, kc) => {
        const p = await plan({ stage });
        expect(p.kc).toBe(kc);
    });

    it('rejects an unknown crop with a helpful message', async () => {
        await expect(plan({ crop: 'Unobtainium' })).rejects.toThrow(/Unknown crop "Unobtainium"/);
    });

    it.todo('rejects an unknown growth stage instead of silently using mid-season Kc');
});

describe('planIrrigation: soil moisture advice', () => {
    // The form sends Dry = 0.2, Moist = 0.5, Wet = 0.8.
    it.each([
        [0.2, 'irrigate'],
        [0.5, 'check'],
        [0.8, 'skip'],
    ])('turns soil moisture %p into the advice "%s"', async (soilMoisture, advice) => {
        const p = await plan({ soilMoisture });

        expect(p.advice).toBe(advice);
    });

    it('never tells the farmer to irrigate a wet field (it used to say "Light irrigation recommended")', async () => {
        const p = await plan({ soilMoisture: 0.8 });

        expect(p.advice).toBe('skip');
        expect(p.notes).toMatch(/skip irrigation/i);
        expect(p.notes).not.toMatch(/irrigation recommended/i);
    });

    it('reports the same crop water use whatever the soil says', async () => {
        const dry = await plan({ soilMoisture: 0.2 });
        const moist = await plan({ soilMoisture: 0.5 });
        const wet = await plan({ soilMoisture: 0.8 });

        expect(moist.etc).toBe(dry.etc);
        expect(wet.etc).toBe(dry.etc);
    });

    it.each([
        [0.34, 'irrigate'],
        [0.35, 'check'],
        [0.64, 'check'],
        [0.65, 'skip'],
        [-1, 'irrigate'],
        [5, 'skip'],
    ])('decides on the boundary value %p as "%s"', async (soilMoisture, advice) => {
        const p = await plan({ soilMoisture });

        expect(p.advice).toBe(advice);
    });

    it.each([
        [0.2, /irrigate today/i],
        [0.5, /check again tomorrow/i],
        [0.8, /skip irrigation today/i],
    ])('explains the advice for soil moisture %p in plain words', async (soilMoisture, wording) => {
        const p = await plan({ soilMoisture });

        expect(p.notes).toMatch(wording);
        expect(p.notes).toMatch(/uses about \d+\.\d mm of water a day/);
    });

    // A future feature, not a bug: needs the soil type, root depth and rainfall.
    it.todo('estimates how many millimetres to apply (root-zone water balance)');
});
