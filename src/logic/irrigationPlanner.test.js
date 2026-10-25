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
    it('produces a plausible ET0, Kc, ETc and water need for tomato at flowering', async () => {
        const p = await plan();

        expect(p.et0).toBeGreaterThan(4);
        expect(p.et0).toBeLessThan(8);
        expect(p.kc).toBe(1.15);
        expect(p.etc).toBeCloseTo(p.et0 * 1.15, 1);
        expect(p.water_needed_mm).toBeGreaterThanOrEqual(0);
        expect(p.water_needed_mm).toBeLessThanOrEqual(p.etc);
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

describe('planIrrigation: soil moisture', () => {
    // Properties that must stay true even if the soil model is redesigned.
    it('needs less water when the soil is wetter', async () => {
        const dry = await plan({ soilMoisture: 0 });
        const wet = await plan({ soilMoisture: 0.8 });

        expect(dry.water_needed_mm).toBeGreaterThan(0);
        expect(wet.water_needed_mm).toBeLessThan(dry.water_needed_mm);
    });

    it('never returns a negative amount, even for out-of-range moisture', async () => {
        const p = await plan({ soilMoisture: 5 });
        expect(p.water_needed_mm).toBeGreaterThanOrEqual(0);
    });

    it.todo('accounts for rainfall and soil type (real root-zone water balance)');
});
