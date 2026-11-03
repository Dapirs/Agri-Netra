import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequestListener } from './index.js';

const SECRET = 'test-secret-key-123';

/** A minimal stand-in for Node's response, so these tests need no network port. */
function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    headersSent: false,
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
    },
    end(chunk = '') {
      res.body += chunk;
      res.headersSent = true;
    },
  };
  return res;
}

/** Sends one request through the server's request logic and returns what it answered. */
async function request(url, { method = 'GET', handler } = {}) {
  const res = mockRes();
  await createRequestListener(handler)({ method, url, headers: {} }, res);
  return {
    status: res.statusCode,
    headers: res.headers,
    text: res.body,
    json: res.body ? JSON.parse(res.body) : null,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('server routing', () => {
  it('answers /healthz with 200 ok', async () => {
    const res = await request('/healthz');

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ status: 'ok' });
  });

  it('answers unknown paths with a JSON 404', async () => {
    const res = await request('/nope');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('hands the query string to the handler as req.query and returns its response', async () => {
    const handler = vi.fn(async (req, res) => {
      res.status(201).json({ got: req.query, method: req.method });
    });

    const res = await request('/api/weather?lat=28.6&lon=77.2', { handler });

    expect(res.status).toBe(201);
    expect(res.json).toEqual({ got: { lat: '28.6', lon: '77.2' }, method: 'GET' });
  });

  it('turns a crashing handler into a generic 500 without leaking details', async () => {
    const handler = async () => {
      throw new Error('database password is hunter2');
    };

    const res = await request('/api/weather?lat=1&lon=2', { handler });

    expect(res.status).toBe(500);
    expect(res.json).toEqual({ error: 'Internal server error' });
    expect(res.text).not.toContain('hunter2');
  });

  it('does not send a second answer when the handler crashes after it already replied', async () => {
    const handler = async (_req, res) => {
      res.status(200).json({ ok: true });
      throw new Error('late failure');
    };

    const res = await request('/api/weather?lat=1&lon=2', { handler });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
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
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => upstream });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request('/api/weather?lat=28.6&lon=77.2');

    expect(res.status).toBe(200);
    expect(res.json).toEqual(upstream);
    expect(fetchMock.mock.calls[0][0]).toContain(`appid=${SECRET}`);
    expect(res.text).not.toContain(SECRET);
  });

  it('rejects bad coordinates with 400', async () => {
    const res = await request('/api/weather?lat=abc&lon=77.2');

    expect(res.status).toBe(400);
  });

  it('rejects non-GET requests with 405', async () => {
    const res = await request('/api/weather?lat=1&lon=2', { method: 'POST' });

    expect(res.status).toBe(405);
  });
});
