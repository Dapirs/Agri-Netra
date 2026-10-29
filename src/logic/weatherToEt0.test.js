import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWeather } from './weatherService.js';
import { calculateET0 } from './et0Calculator.js';

// calculateET0 refuses radiation the sun cannot deliver, so the radiation the
// weather service estimates must always pass that check. This keeps the two
// from drifting apart and breaking real irrigation requests.

const okResponse = (clouds) => ({
    ok: true,
    json: async () => ({ main: { temp: 24, humidity: 60 }, wind: { speed: 2 }, clouds: { all: clouds } }),
});

beforeEach(() => {
    const store = {};
    vi.stubGlobal('localStorage', {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
    });
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('weather service radiation estimate feeds calculateET0', () => {
    it('is accepted at every latitude, season and cloud cover, including the poles', async () => {
        let combinations = 0;

        for (const lat of [-90, -80, -60, -30, 0, 12.97, 28.6, 55, 70, 80, 90]) {
            for (let month = 0; month < 12; month++) {
                const day = new Date(2026, month, 15, 12, 0, 0);
                vi.setSystemTime(day);
                const doy = Math.floor((day - new Date(2026, 0, 0)) / 86_400_000);

                for (const clouds of [0, 25, 50, 75, 100]) {
                    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(clouds)));
                    const weather = await getWeather(lat, 77);

                    const et0 = calculateET0({
                        temp_c: weather.temp_c,
                        humidity: weather.humidity,
                        wind_ms: weather.wind_ms * 0.748,
                        solar_rad: weather.solar_rad,
                        doy,
                        lat,
                    });

                    expect(Number.isFinite(et0)).toBe(true);
                    combinations++;
                }
            }
        }

        expect(combinations).toBe(11 * 12 * 5);
    });
});
