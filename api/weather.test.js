import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SECRET = 'test-secret-key-123';

function mockRes() {
    const res = {
        statusCode: 200,
        body: undefined,
        headers: {},
        status(code) { res.statusCode = code; return res; },
        json(payload) { res.body = payload; return res; },
        setHeader(name, value) { res.headers[name.toLowerCase()] = value; return res; },
    };
    return res;
}

let handler;

const call = async (req) => {
    const res = mockRes();
    await handler({ method: 'GET', query: { lat: '28.6', lon: '77.2' }, ...req }, res);
    return res;
};

const upstreamOk = () =>
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ main: { temp: 1 } }) });

beforeEach(async () => {
    // The rate limiter keeps its counters in module state, so load a fresh copy per test.
    vi.resetModules();
    ({ default: handler } = await import('./weather.js'));

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
});

describe('api/weather handler: coordinates', () => {
    it.each([
        ['', ''],
        ['', '77.2'],
        ['28.6', ''],
        ['   ', '77.2'],
    ])('treats empty lat %p / lon %p as invalid instead of coordinates 0,0', async (lat, lon) => {
        const fetchMock = upstreamOk();
        vi.stubGlobal('fetch', fetchMock);

        const res = await call({ query: { lat, lon } });

        expect(res.statusCode).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ['91', '0'],
        ['-91', '0'],
        ['0', '181'],
        ['0', '-181'],
        ['500', '500'],
    ])('rejects latitude %p / longitude %p as out of range without calling OpenWeatherMap', async (lat, lon) => {
        const fetchMock = upstreamOk();
        vi.stubGlobal('fetch', fetchMock);

        const res = await call({ query: { lat, lon } });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/between -90 and 90/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ['0x10', '5'],
        ['Infinity', '5'],
        ['1,5', '5'],
        [['1', '2'], '5'],
    ])('rejects the odd value lat %p / lon %p', async (lat, lon) => {
        const res = await call({ query: { lat, lon } });

        expect(res.statusCode).toBe(400);
    });

    it.each([
        ['90', '180'],
        ['-90', '-180'],
        ['0', '0'], // a real place (in the Atlantic), as long as the caller really asked for it
        ['28.6139', '77.209'],
        ['1e-7', '-2.5e1'],
    ])('accepts lat %p / lon %p', async (lat, lon) => {
        vi.stubGlobal('fetch', upstreamOk());

        const res = await call({ query: { lat, lon } });

        expect(res.statusCode).toBe(200);
    });
});

describe('api/weather handler: rate limit', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 3, 10, 12, 0, 0));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const fromClient = (forwardedFor) => ({ headers: { 'x-forwarded-for': forwardedFor } });

    it('allows 30 requests a minute from one client, then answers 429 with Retry-After', async () => {
        const fetchMock = upstreamOk();
        vi.stubGlobal('fetch', fetchMock);

        for (let i = 0; i < 30; i++) {
            expect((await call(fromClient('203.0.113.7'))).statusCode).toBe(200);
        }
        const blocked = await call(fromClient('203.0.113.7'));

        expect(blocked.statusCode).toBe(429);
        expect(blocked.body.error).toBe('Too many requests');
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
        expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);
        expect(fetchMock).toHaveBeenCalledTimes(30); // blocked requests never reach OpenWeatherMap
    });

    it('counts each client separately', async () => {
        vi.stubGlobal('fetch', upstreamOk());
        for (let i = 0; i < 31; i++) await call(fromClient('203.0.113.7'));

        expect((await call(fromClient('203.0.113.7'))).statusCode).toBe(429);
        expect((await call(fromClient('198.51.100.9'))).statusCode).toBe(200);
    });

    it('lets the client back in once the minute is over, with a fresh allowance of 30', async () => {
        vi.stubGlobal('fetch', upstreamOk());
        for (let i = 0; i < 31; i++) await call(fromClient('203.0.113.7'));
        expect((await call(fromClient('203.0.113.7'))).statusCode).toBe(429);

        vi.advanceTimersByTime(60_000);

        for (let i = 0; i < 30; i++) {
            expect((await call(fromClient('203.0.113.7'))).statusCode).toBe(200);
        }
        expect((await call(fromClient('203.0.113.7'))).statusCode).toBe(429);
    });

    // nginx appends the address it saw to whatever the client sent, so only the last entry
    // can be trusted. Entries the client adds in front must not let it dodge the limit.
    it('keys on the last X-Forwarded-For entry, so forged ones cannot dodge the limit', async () => {
        vi.stubGlobal('fetch', upstreamOk());

        for (let i = 0; i < 30; i++) {
            await call(fromClient(`10.0.0.${i}, 203.0.113.7`));
        }

        expect((await call(fromClient('192.0.2.99, 203.0.113.7'))).statusCode).toBe(429);
    });

    it('still works when no forwarding header is present', async () => {
        vi.stubGlobal('fetch', upstreamOk());

        expect((await call({})).statusCode).toBe(200);
    });

    it('does not let rate limiting change the answers for invalid requests', async () => {
        const res = await call({ query: { lat: 'abc', lon: '1' }, ...fromClient('203.0.113.7') });

        expect(res.statusCode).toBe(400);
    });
});
