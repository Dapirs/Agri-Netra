/**
 * History Store
 * ─────────────
 * Persists plant diagnosis / irrigation results in localStorage.
 * Keeps the most recent 20 entries (FIFO).
 *
 * Storage key: "plantapp_history"
 */

const STORAGE_KEY = 'plantapp_history';
const MAX_ENTRIES = 20;

/**
 * Read the full history array from localStorage.
 * Returns an empty array if nothing is stored or on parse error.
 *
 * @returns {{ id: string, timestamp: string, [key: string]: any }[]}
 */
export function getHistory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Append a result to the history.
 * Automatically adds `id` (UUID-like) and `timestamp` fields.
 * Trims the list to the most recent {@link MAX_ENTRIES} entries.
 *
 * Never throws: if the browser refuses to store the data (storage full or
 * blocked), the entry is still returned, it just isn't persisted.
 *
 * @param {object} result – Any serialisable result object
 *                          (e.g. prediction result, irrigation plan)
 * @returns {object} The entry (with id & timestamp attached)
 */
export function saveResult(result) {
    const entry = {
        id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        ...result,
    };

    const history = getHistory();
    history.push(entry);

    // Keep only the latest MAX_ENTRIES
    const trimmed = history.slice(-MAX_ENTRIES);

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
        // Storage full – remove oldest half and retry
        const reduced = trimmed.slice(Math.floor(trimmed.length / 2));
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
        } catch {
            // Still failing (storage full or blocked): carry on without saving.
            // History is a convenience and must never break showing a result.
        }
    }

    return entry;
}

/**
 * Clear all stored history.
 */
export function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
}

export default { saveResult, getHistory, clearHistory };
