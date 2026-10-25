import { describe, it, expect } from 'vitest';
import { calculateET0, extraterrestrialRadiation } from './et0Calculator.js';

const rad = (deg) => (deg * Math.PI) / 180;

// Delhi, 10 April (day 100): hot, dry-season day. Inputs are 24 h MEANS.
const base = {
    temp_c: 30,
    humidity: 50,
    wind_ms: 2,
    solar_rad: 260,
    elevation: 200,
    doy: 100,
    lat: 28.6,
};

describe('extraterrestrialRadiation (Ra)', () => {
    it('is in the physically expected range at mid latitudes in spring', () => {
        const ra = extraterrestrialRadiation(rad(28.6), 100);
        expect(ra).toBeGreaterThan(33);
        expect(ra).toBeLessThan(40);
    });

    it('is much larger in summer than in winter at 45°N', () => {
        const summer = extraterrestrialRadiation(rad(45), 172);
        const winter = extraterrestrialRadiation(rad(45), 355);
        expect(summer).toBeGreaterThan(winter * 2);
    });

    it('is 0 during polar night', () => {
        expect(extraterrestrialRadiation(rad(80), 355)).toBe(0);
    });
});

describe('calculateET0', () => {
    it('gives a plausible value for a hot dry-season day', () => {
        const et0 = calculateET0(base);
        expect(et0).toBeGreaterThan(3);
        expect(et0).toBeLessThan(9);
    });

    // Regression value computed by this implementation, NOT an external reference.
    // Replace/augment with an FAO-56 worked example or an Open-Meteo cross-check.
    it('matches the recorded regression value', () => {
        expect(calculateET0(base)).toBeCloseTo(6.0, 2);
    });

    it('rises with more radiation', () => {
        expect(calculateET0({ ...base, solar_rad: 300 })).toBeGreaterThan(
            calculateET0({ ...base, solar_rad: 200 })
        );
    });

    it('rises with more wind', () => {
        expect(calculateET0({ ...base, wind_ms: 4 })).toBeGreaterThan(
            calculateET0({ ...base, wind_ms: 1 })
        );
    });

    it('falls with higher humidity', () => {
        expect(calculateET0({ ...base, humidity: 80 })).toBeLessThan(
            calculateET0({ ...base, humidity: 30 })
        );
    });

    it('rises with higher temperature', () => {
        expect(calculateET0({ ...base, temp_c: 35 })).toBeGreaterThan(
            calculateET0({ ...base, temp_c: 20 })
        );
    });

    it('is never negative or NaN, even in cold, saturated, sunless conditions', () => {
        const cold = calculateET0({
            temp_c: -10, humidity: 100, wind_ms: 0, solar_rad: 0, doy: 355, lat: 80,
        });
        expect(Number.isFinite(cold)).toBe(true);
        expect(cold).toBeGreaterThanOrEqual(0);
    });

    it.todo('throws when lat is missing instead of silently using 0');
    it.todo('throws on NaN or out-of-range inputs (humidity > 100, doy > 366)');
    it.todo('rejects solar_rad larger than the sun can deliver at that latitude and day');
});
