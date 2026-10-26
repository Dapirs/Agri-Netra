/**
 * Weather API server
 * ──────────────────
 * Tiny dependency-free HTTP server that runs the existing serverless handler
 * (api/weather.js) outside Vercel, e.g. in a Docker container.
 *
 *   GET /api/weather?lat=..&lon=..  → api/weather.js
 *   GET /healthz                    → liveness / readiness probe
 *
 * Config: PORT (default 3000) and OPENWEATHER_API_KEY (read by the handler).
 */

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import weatherHandler from '../api/weather.js';

function sendJson(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}

/** Give a plain Node response the res.status().json() helpers the handler expects. */
function withHelpers(res) {
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(body));
        return res;
    };
    return res;
}

/**
 * @param {(req, res) => Promise<void>} [handler] – defaults to api/weather.js
 * @returns {http.Server}
 */
export function createServer(handler = weatherHandler) {
    return http.createServer(async (req, res) => {
        try {
            const { pathname, searchParams } = new URL(req.url, 'http://localhost');

            if (pathname === '/healthz') {
                sendJson(res, 200, { status: 'ok' });
                return;
            }

            if (pathname === '/api/weather') {
                req.query = Object.fromEntries(searchParams);
                await handler(req, withHelpers(res));
                return;
            }

            sendJson(res, 404, { error: 'Not found' });
        } catch (error) {
            console.error('[server] Unhandled error:', error);
            if (!res.headersSent) {
                sendJson(res, 500, { error: 'Internal server error' });
            } else {
                res.end();
            }
        }
    });
}

// Start listening only when run directly (`node server/index.js`), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const port = Number(process.env.PORT) || 3000;
    const server = createServer();

    server.listen(port, '0.0.0.0', () => {
        console.log(`[server] weather API listening on port ${port}`);
    });

    // Containers and Kubernetes stop processes with SIGTERM: finish requests, then exit.
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
