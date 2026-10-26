import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { createServer } from './index.js';

const SECRET = 'test-secret-key-123';

let server;

/** Start the server on a random free port. */
const start = (handler) =>
    new Promise((resolve) => {
        server = handler ? createServer(handler) : createServer();
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });

/** GET a path from the running server (node:http, so a stubbed global fetch can't interfere). */
const get = (port, path, method = 'GET') =>
    new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () =>
                resolve({ status: res.statusCode, headers: res.headers, text: data, json: data ? JSON.parse(data) : null })
            );
        });
        req.on('error', reject);
        req.end();
    });

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    server = undefined;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('server routing', () => {
    it('answers /healthz with 200 ok', async () => {
        const port = await start();
        const res = await get(port, '/healthz');

        expect(res.status).toBe(200);
        expect(res.json).toEqual({ status: 'ok' });
    });

    it('answers unknown paths with a JSON 404', async () => {
        const port = await start();
        const res = await get(port, '/nope');

        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toContain('application/json');
    });

    it('hands the query string to the handler as req.query and returns its response', async () => {
        const handler = vi.fn(async (req, res) => {
            res.status(201).json({ got: req.query, method: req.method });
        });
        const port = await start(handler);

        const res = await get(port, '/api/weather?lat=28.6&lon=77.2');

        expect(res.status).toBe(201);
        expect(res.json).toEqual({ got: { lat: '28.6', lon: '77.2' }, method: 'GET' });
    });

    it('turns a crashing handler into a generic 500 without leaking details', async () => {
        const port = await start(async () => {
            throw new Error('database password is hunter2');
        });

        const res = await get(port, '/api/weather?lat=1&lon=2');

        expect(res.status).toBe(500);
        expect(res.json).toEqual({ error: 'Internal server error' });
        expect(res.text).not.toContain('hunter2');
    });
});

describe('server with the real weather handler', () => {
    beforeEach(() => {
        vi.stubEnv('OPENWEATHER_API_KEY', SECRET);
        vi.stubEnv('VITE_OPENWEATHERMAP_API_KEY', '');
        vi.stubEnv('OPENWEATHERMAP_API_KEY', '');
    });

    it('returns weather data and never exposes the API key', async () => {
        const upstream = { main: { temp: 30, humidity: 40 }, wind: { speed: 2 }, clouds: { all: 10 } };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => upstream });
        vi.stubGlobal('fetch', fetchMock);
        const port = await start();

        const res = await get(port, '/api/weather?lat=28.6&lon=77.2');

        expect(res.status).toBe(200);
        expect(res.json).toEqual(upstream);
        expect(fetchMock.mock.calls[0][0]).toContain(`appid=${SECRET}`);
        expect(res.text).not.toContain(SECRET);
    });

    it('rejects bad coordinates with 400', async () => {
        const port = await start();
        const res = await get(port, '/api/weather?lat=abc&lon=77.2');

        expect(res.status).toBe(400);
    });

    it('rejects non-GET requests with 405', async () => {
        const port = await start();
        const res = await get(port, '/api/weather?lat=1&lon=2', 'POST');

        expect(res.status).toBe(405);
    });
});
