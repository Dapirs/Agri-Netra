/**
 * Weather Service
 * ────────────────
 * Fetches current weather through the /api/weather serverless proxy
 * (the OpenWeatherMap key lives on the server, never in the browser).
 * Every successful response is saved to localStorage and reused for up
 * to 1 hour only when a later request fails (offline/network fallback).
 *
 * Returns: { temp_c, humidity, wind_ms, solar_rad, weather_cached }
 *   solar_rad is an estimated 24 h mean (W/m²). temp_c, humidity and wind_ms
 *   are current readings used as stand-ins for daily means (approximation).
 */

import { extraterrestrialRadiation } from './et0Calculator.js';

const CACHE_KEY = 'gaslighters_weather_cache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Retrieve cached weather data from localStorage.
 * Returns the cached payload if it exists and hasn't expired, otherwise null.
 */
function getCachedWeather(lat, lon) {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;

        const cached = JSON.parse(raw);

        // Validate that the cache matches the requested coordinates (rounded to 2 dp)
        const sameLocation =
            Math.abs(cached.lat - lat) < 0.01 &&
            Math.abs(cached.lon - lon) < 0.01;

        if (!sameLocation) return null;

        // Check expiry
        if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;

        return cached.data;
    } catch {
        return null;
    }
}

/**
 * Persist weather data to localStorage with a timestamp.
 */
function setCachedWeather(lat, lon, data) {
    try {
        const entry = {
            lat,
            lon,
            timestamp: Date.now(),
            data,
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {
        // Storage full or unavailable – fail silently
    }
}

/**
 * Estimate daily-mean solar radiation (W/m²) from cloud cover.
 * OpenWeatherMap has no solar-radiation field, so we use the FAO-56
 * Ångström–Prescott form Rs = (0.25 + 0.50·n/N)·Ra, with the clear-sky
 * fraction (1 − cloud) standing in for the sunshine fraction n/N.
 * Ra (top-of-atmosphere radiation for this latitude and day) keeps the
 * result physically possible. Returned as a 24 h mean in W/m², which is
 * what calculateET0 expects.
 */
function estimateSolarRadiation(cloudPercent, lat) {
    const now = new Date();
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86_400_000);
    const Ra = extraterrestrialRadiation((Math.PI / 180) * lat, doy); // MJ/m²/day
    const clearFraction = 1 - cloudPercent / 100;
    const Rs = (0.25 + 0.5 * clearFraction) * Ra; // MJ/m²/day
    return Math.round(Rs / 0.0864); // → 24 h mean W/m²
}

/**
 * Fetch current weather through the /api/weather proxy.
 *
 * @param {number} lat      – Latitude
 * @param {number} lon      – Longitude
 * @returns {Promise<{temp_c: number, humidity: number, wind_ms: number, solar_rad: number, weather_cached: boolean}>}
 */
export async function getWeather(lat, lon) {
    // 1. Try fetching fresh weather first
    const url =
        `/api/weather` +
        `?lat=${encodeURIComponent(lat)}` +
        `&lon=${encodeURIComponent(lon)}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `Weather request failed: ${response.status} ${response.statusText}`
            );
        }

        const json = await response.json();

        const data = {
            temp_c: json.main.temp,
            humidity: json.main.humidity,
            wind_ms: json.wind.speed,
            solar_rad: estimateSolarRadiation(json.clouds?.all ?? 0, lat),
        };

        // 2. Cache fresh result for offline/network-failure fallback
        setCachedWeather(lat, lon, data);

        return { ...data, weather_cached: false };
    } catch (error) {
        const cached = getCachedWeather(lat, lon);
        if (cached) {
            return { ...cached, weather_cached: true };
        }
        throw error;
    }
}

export default getWeather;
