import http from 'node:http';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * These tests talk to the server over a real local network connection. They need a
 * machine that lets a process listen on and connect to 127.0.0.1, which locked-down
 * sandboxes sometimes forbid. When it is not possible they are SKIPPED, not failed:
 * the routing logic is covered without a network in index.test.js, and CI also
 * smoke-tests the real container over HTTP.
 */
function loopbackWorks() {
  return new Promise((resolve) => {
    const probe = http.createServer((_req, res) => res.end('ok'));
    probe.once('error', () => resolve(false));
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      const done = (works) => probe.close(() => resolve(works));
      const req = http.get({ host: '127.0.0.1', port, timeout: 1000 }, (res) => {
        res.resume();
        done(true);
      });
      req.once('timeout', () => req.destroy());
      req.once('error', () => done(false));
    });
  });
}

const networkAvailable = await loopbackWorks();

describe.skipIf(!networkAvailable)('server over real HTTP (needs local networking)', () => {
  let server;
  let createServer;

  const start = () =>
    new Promise((resolve, reject) => {
      server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });

  /** GET or POST a path; fails fast with a clear message instead of hanging. */
  const send = (port, path, { method = 'GET' } = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path, method, timeout: 2000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: data,
            json: data ? JSON.parse(data) : null,
          })
        );
      });
      req.once('timeout', () =>
        req.destroy(
          new Error(`No answer from 127.0.0.1:${port} within 2s. Is local networking blocked?`)
        )
      );
      req.once('error', reject);
      req.end();
    });

  beforeEach(async () => {
    vi.resetModules(); // fresh rate-limit counters for every test
    ({ createServer } = await import('./index.js'));
    vi.stubEnv('OPENWEATHER_API_KEY', 'test-secret-key-123');
    vi.stubEnv('VITE_OPENWEATHERMAP_API_KEY', '');
    vi.stubEnv('OPENWEATHERMAP_API_KEY', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      server = undefined;
    }
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers /healthz', async () => {
    const port = await start();

    const res = await send(port, '/healthz');

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ status: 'ok' });
  });

  it('returns weather data over a real connection without exposing the key', async () => {
    const upstream = { main: { temp: 30 }, wind: { speed: 2 }, clouds: { all: 10 } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => upstream })
    );
    const port = await start();

    const res = await send(port, '/api/weather?lat=28.6&lon=77.2');

    expect(res.status).toBe(200);
    expect(res.json).toEqual(upstream);
    expect(res.text).not.toContain('test-secret-key-123');
  });

  it('sends the Retry-After header on a real response once the rate limit is hit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ main: {} }) })
    );
    const port = await start();

    for (let i = 0; i < 30; i++) await send(port, '/api/weather?lat=1&lon=2');
    const blocked = await send(port, '/api/weather?lat=1&lon=2');

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });
});
