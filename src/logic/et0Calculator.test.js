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
});

describe('calculateET0: input validation', () => {
    const FIELDS = ['temp_c', 'humidity', 'wind_ms', 'solar_rad', 'elevation', 'doy', 'lat'];

    it('throws when lat is missing instead of silently using 0', () => {
        const { lat: _lat, ...withoutLat } = base;

        expect(() => calculateET0(withoutLat)).toThrow(/lat must be a finite number/);
    });

    it.each(FIELDS)('throws a TypeError when %s is NaN, Infinity, text or null', (field) => {
        for (const bad of [NaN, Infinity, '30', null]) {
            expect(() => calculateET0({ ...base, [field]: bad })).toThrow(TypeError);
        }
    });

    it.each(FIELDS.filter((field) => field !== 'elevation'))(
        'throws a TypeError when %s is missing',
        (field) => {
            const { [field]: _removed, ...incomplete } = base;

            expect(() => calculateET0(incomplete)).toThrow(TypeError);
        }
    );

    it('uses sea level when elevation is not given', () => {
        const { elevation: _elevation, ...withoutElevation } = base;

        expect(calculateET0(withoutElevation)).toBe(calculateET0({ ...base, elevation: 0 }));
    });

    it.each([
        ['temp_c', -61],
        ['temp_c', 61],
        ['humidity', -1],
        ['humidity', 101],
        ['wind_ms', -0.1],
        ['wind_ms', 101],
        ['solar_rad', -1],
        ['solar_rad', 1500],
        ['elevation', -501],
        ['elevation', 9001],
        ['doy', 0],
        ['doy', 367],
        ['lat', -90.1],
        ['lat', 90.1],
    ])('throws a RangeError for %s = %p', (field, value) => {
        expect(() => calculateET0({ ...base, [field]: value })).toThrow(RangeError);
    });

    it('throws a RangeError for a day of the year that is not a whole number', () => {
        expect(() => calculateET0({ ...base, doy: 100.5 })).toThrow(RangeError);
    });

    it.each([
        ['temp_c', -60],
        ['temp_c', 60],
        ['humidity', 0],
        ['humidity', 100],
        ['wind_ms', 0],
        ['solar_rad', 0],
        ['elevation', -500],
        ['elevation', 9000],
        ['doy', 1],
        ['doy', 366],
        ['lat', 90],
        ['lat', -90],
    ])('accepts the boundary value %s = %p and returns a finite, non-negative number', (field, value) => {
        // The base 260 W/m² is an April average. In midwinter the sun delivers less
        // (at most ~240 W/m² at 28.6°N), and at the poles it can be absent altogether.
        const radiation = { lat: { solar_rad: 0 }, doy: { solar_rad: 100 } }[field] ?? {};
        const params = { ...base, ...radiation, [field]: value };

        const et0 = calculateET0(params);

        expect(Number.isFinite(et0)).toBe(true);
        expect(et0).toBeGreaterThanOrEqual(0);
    });
});

describe('calculateET0: solar radiation limit', () => {
    const clearSkyMax = (lat, doy) =>
        Math.round((0.75 * extraterrestrialRadiation(rad(lat), doy)) / 0.0864);

    it('rejects a noon-peak value passed as a daily mean (the bug that once made ET0 2-3x too high)', () => {
        expect(() => calculateET0({ ...base, solar_rad: 1000 })).toThrow(
            /more than the sun can deliver/
        );
    });

    it('names the latitude, the day and the maximum in its message', () => {
        expect(() => calculateET0({ ...base, solar_rad: 1000 })).toThrow(/latitude 28\.6 on day 100/);
    });

    it('accepts the clear-sky maximum for that latitude and day', () => {
        expect(() =>
            calculateET0({ ...base, solar_rad: clearSkyMax(base.lat, base.doy) })
        ).not.toThrow();
    });

    it('allows no sunlight at all during polar night, and nothing more', () => {
        const polarNight = { temp_c: -10, humidity: 80, wind_ms: 2, doy: 355, lat: 80 };

        expect(() => calculateET0({ ...polarNight, solar_rad: 0 })).not.toThrow();
        expect(() => calculateET0({ ...polarNight, solar_rad: 50 })).toThrow(RangeError);
    });
});
