import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './weather.js';

const SECRET = 'test-secret-key-123';

function mockRes() {
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) { res.statusCode = code; return res; },
        json(payload) { res.body = payload; return res; },
    };
    return res;
}

const call = async (req) => {
    const res = mockRes();
    await handler({ method: 'GET', query: { lat: '28.6', lon: '77.2' }, ...req }, res);
    return res;
};

beforeEach(() => {
    vi.stubEnv('OPENWEATHER_API_KEY', SECRET);
    vi.stubEnv('VITE_OPENWEATHERMAP_API_KEY', '');
    vi.stubEnv('OPENWEATHERMAP_API_KEY', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('api/weather handler', () => {
    it('rejects non-GET requests with 405', async () => {
        const res = await call({ method: 'POST' });
        expect(res.statusCode).toBe(405);
    });

    it.each([
        [{}],
        [{ lat: 'abc', lon: '77.2' }],
        [{ lat: '28.6' }],
    ])('rejects missing or non-numeric coordinates with 400 (%o)', async (query) => {
        const res = await call({ query });
        expect(res.statusCode).toBe(400);
    });

    it('answers 500 when no API key is configured', async () => {
        vi.stubEnv('OPENWEATHER_API_KEY', '');
        const res = await call({});
        expect(res.statusCode).toBe(500);
    });

    it('forwards the request to OpenWeatherMap with the key and returns the data', async () => {
        const upstream = { main: { temp: 30, humidity: 40 }, wind: { speed: 2 }, clouds: { all: 10 } };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => upstream });
        vi.stubGlobal('fetch', fetchMock);

        const res = await call({});

        const url = fetchMock.mock.calls[0][0];
        expect(url).toContain('api.openweathermap.org');
        expect(url).toContain('lat=28.6');
        expect(url).toContain('lon=77.2');
        expect(url).toContain('units=metric');
        expect(url).toContain(`appid=${SECRET}`);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(upstream);
    });

    it('never leaks the API key in what it sends back to the browser', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ main: { temp: 1 } }),
        }));
        const ok = await call({});
        expect(JSON.stringify(ok.body)).not.toContain(SECRET);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false, status: 401, json: async () => ({ cod: 401, message: 'Invalid API key' }),
        }));
        const failed = await call({});
        expect(JSON.stringify(failed.body)).not.toContain(SECRET);
    });

    it('passes an upstream error status through to the caller', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false, status: 401, json: async () => ({ cod: 401, message: 'Invalid API key' }),
        }));
        const res = await call({});
        expect(res.statusCode).toBe(401);
    });

    it('answers 502 when OpenWeatherMap is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
        const res = await call({});
        expect(res.statusCode).toBe(502);
    });

    it.todo('rejects latitude outside [-90, 90] and longitude outside [-180, 180]');
    it.todo('treats empty lat/lon strings as invalid instead of coordinates 0,0');
    it.todo('rate-limits callers so the OpenWeatherMap quota cannot be burned');
});
