import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWeather } from './weatherService.js';
import { extraterrestrialRadiation } from './et0Calculator.js';

const owm = (clouds = 20) => ({
    main: { temp: 31.2, humidity: 48 },
    wind: { speed: 3.1 },
    clouds: { all: clouds },
});
const okResponse = (body) => ({ ok: true, json: async () => body });
const failResponse = (status, statusText) => ({ ok: false, status, statusText });

const LAT = 28.6139;
const LON = 77.209;
const HOUR = 60 * 60 * 1000;

let store;

beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10, 12, 0, 0)); // 10 April, local noon = day 100
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('getWeather: request', () => {
    it('calls the /api/weather proxy and never puts an API key in the URL', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse(owm()));
        vi.stubGlobal('fetch', fetchMock);

        await getWeather(LAT, LON);

        const url = fetchMock.mock.calls[0][0];
        expect(url).toBe(`/api/weather?lat=${LAT}&lon=${LON}`);
        expect(url).not.toMatch(/appid|openweathermap/i);
    });

    it('returns the normalised reading flagged as live data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(owm())));

        const w = await getWeather(LAT, LON);

        expect(w).toMatchObject({
            temp_c: 31.2,
            humidity: 48,
            wind_ms: 3.1,
            weather_cached: false,
        });
        expect(typeof w.solar_rad).toBe('number');
    });
});

describe('getWeather: failure and cache fallback', () => {
    it('falls back to the cached reading when the proxy errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(okResponse(owm())));
        await getWeather(LAT, LON);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failResponse(502, 'Bad Gateway')));
        const w = await getWeather(LAT, LON);

        expect(w.weather_cached).toBe(true);
        expect(w.temp_c).toBe(31.2);
    });

    it('does not reuse the cache for a different location', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(okResponse(owm())));
        await getWeather(LAT, LON);

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        await expect(getWeather(12.97, 77.59)).rejects.toThrow('Failed to fetch');
    });

    it('does not reuse a cache entry older than one hour', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(okResponse(owm())));
        await getWeather(LAT, LON);

        vi.advanceTimersByTime(HOUR + 60_000);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        await expect(getWeather(LAT, LON)).rejects.toThrow('Failed to fetch');
    });

    it('reports a clear error when the proxy fails and there is no cache', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failResponse(500, 'Internal Server Error')));
        await expect(getWeather(LAT, LON)).rejects.toThrow('Weather request failed: 500');
    });
});

describe('getWeather: estimated solar radiation', () => {
    it('is a 24 h mean, not a noon peak (clear day in Delhi in April)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(owm(0))));
        const { solar_rad } = await getWeather(LAT, LON);
        // Regression guard: the old code returned 1000 W/m² here.
        expect(solar_rad).toBeGreaterThan(250);
        expect(solar_rad).toBeLessThan(400);
    });

    it('falls as cloud cover rises but stays above zero', async () => {
        const at = async (clouds) => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(owm(clouds))));
            return (await getWeather(LAT, LON)).solar_rad;
        };
        const clear = await at(0);
        const half = await at(50);
        const overcast = await at(100);

        expect(clear).toBeGreaterThan(half);
        expect(half).toBeGreaterThan(overcast);
        expect(overcast).toBeGreaterThan(0);
    });

    it('never exceeds the clear-sky ceiling at any latitude, season or cloud cover', async () => {
        // Clear sky is 0.75·Ra. The estimate is rounded to whole W/m², which can
        // add at most 0.5 W/m² = 0.0432 MJ/m²/day, so allow 0.05 on top.
        for (const lat of [-60, -30, 0, 28.6, 55]) {
            for (let month = 0; month < 12; month++) {
                const day = new Date(2026, month, 15, 12, 0, 0);
                vi.setSystemTime(day);
                const doy = Math.floor((day - new Date(2026, 0, 0)) / 86_400_000);
                const ra = extraterrestrialRadiation((Math.PI / 180) * lat, doy);

                for (const clouds of [0, 50, 100]) {
                    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(owm(clouds))));
                    const { solar_rad } = await getWeather(lat, 77);
                    expect(solar_rad * 0.0864).toBeLessThanOrEqual(ra * 0.75 + 0.05);
                }
            }
        }
    });
});
