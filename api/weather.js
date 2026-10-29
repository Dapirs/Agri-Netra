/* ───────── Coordinates ───────── */

// Plain decimal numbers only, including exponent form (how JavaScript prints tiny numbers).
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** Parses a query value like "28.6139" into a number within ±max, or returns null. */
function parseCoordinate(value, max) {
    if (typeof value !== 'string' || !DECIMAL.test(value.trim())) return null;
    const number = Number(value);
    return Math.abs(number) <= max ? number : null;
}

/* ───────── Rate limit ───────── */

// Best effort: counters live in this process's memory, so each server instance
// (or serverless instance) counts on its own and a restart resets them.
const RATE_LIMIT_MAX = 30;           // requests per client per window
const RATE_LIMIT_WINDOW_MS = 60_000; // one minute
const clients = new Map();           // client address -> { count, resetAt }

/** The address of the caller. Behind a proxy it is the LAST X-Forwarded-For entry:
 *  the proxy (nginx, Vercel) appends the address it saw, while earlier entries can be forged. */
function clientAddress(req) {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',').pop().trim();
    }
    return req.socket?.remoteAddress ?? 'unknown';
}

/** Returns 0 if the request may go ahead, otherwise how many seconds the caller must wait. */
function checkRateLimit(address, now = Date.now()) {
    if (clients.size > 1000) {
        for (const [key, entry] of clients) {
            if (entry.resetAt <= now) clients.delete(key);
        }
    }

    const entry = clients.get(address);
    if (!entry || entry.resetAt <= now) {
        clients.set(address, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return 0;
    }
    if (entry.count >= RATE_LIMIT_MAX) {
        return Math.ceil((entry.resetAt - now) / 1000);
    }
    entry.count += 1;
    return 0;
}

export default async function handler(req, res) {
    const apiKey =
        process.env.OPENWEATHER_API_KEY ||
        process.env.VITE_OPENWEATHERMAP_API_KEY ||
        process.env.OPENWEATHERMAP_API_KEY;

    console.log('[api/weather] OPENWEATHER_API_KEY configured:', !!process.env.OPENWEATHER_API_KEY);
    console.log('[api/weather] VITE_OPENWEATHERMAP_API_KEY configured:', !!process.env.VITE_OPENWEATHERMAP_API_KEY);
    console.log('[api/weather] Effective weather key configured:', !!apiKey);

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const retryAfter = checkRateLimit(clientAddress(req));
    if (retryAfter > 0) {
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
            error: 'Too many requests',
            message: `Try again in ${retryAfter} seconds.`,
        });
        return;
    }

    const { lat, lon } = req.query ?? {};
    const parsedLat = parseCoordinate(lat, 90);
    const parsedLon = parseCoordinate(lon, 180);

    if (parsedLat === null || parsedLon === null) {
        res.status(400).json({
            error: 'Invalid lat/lon query parameters',
            message: 'lat must be a number between -90 and 90, and lon between -180 and 180.',
        });
        return;
    }

    if (!apiKey) {
        res.status(500).json({
            error: 'Server weather key is not configured',
            message: 'Set OPENWEATHER_API_KEY in the server runtime environment.',
        });
        return;
    }

    const url =
        'https://api.openweathermap.org/data/2.5/weather' +
        `?lat=${encodeURIComponent(parsedLat)}` +
        `&lon=${encodeURIComponent(parsedLon)}` +
        '&units=metric' +
        `&appid=${encodeURIComponent(apiKey)}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (!response.ok) {
            const upstreamMessage = json?.message || `HTTP ${response.status}`;
            console.error('[api/weather] OpenWeatherMap error:', {
                status: response.status,
                message: upstreamMessage,
            });

            res.status(response.status).json({
                error: 'OpenWeatherMap API error',
                message: upstreamMessage,
                details: json,
            });
            return;
        }

        res.status(200).json(json);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const cause = error instanceof Error && error.cause ? String(error.cause) : null;
        console.error('[api/weather] Weather proxy request failed:', message);
        res.status(502).json({
            error: 'Weather proxy request failed',
            message,
            cause,
        });
    }
}
