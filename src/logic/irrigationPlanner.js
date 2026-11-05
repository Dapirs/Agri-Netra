/**
 * Irrigation Planner
 * ──────────────────
 * Combines weather data, FAO-56 ET₀, and crop coefficients to
 * calculate today's crop water use (ETc), plus a simple skip / check /
 * irrigate decision from the reported soil moisture.
 *
 * Pipeline:  getWeather → calculateET0 → lookup Kc → ETc → advice
 */

import { getWeather } from './weatherService.js';
import { calculateET0 } from './et0Calculator.js';
import { CROP_COEFFICIENTS } from '../data/cropCoefficients.js';

/**
 * OpenWeatherMap reports wind at 10 m; FAO-56 needs it at 2 m.
 * u2 = u10 · 4.87 / ln(67.8·10 − 5.42) ≈ 0.748 · u10 (FAO-56 Eq. 47).
 */
const WIND_10M_TO_2M = 0.748;

/**
 * The form asks for Dry / Moist / Wet and sends 0.2 / 0.5 / 0.8. These cut-offs sit
 * halfway between those levels: below DRY_BELOW the soil is dry, from WET_FROM it is wet.
 */
const DRY_BELOW = 0.35;
const WET_FROM = 0.65;

/* ───────── Stage → Kc key mapping ───────── */

const STAGE_KC_MAP = {
  initial: 'initial',
  mid: 'mid',
  end: 'late',
  late: 'late',
  // Convenience aliases
  ini: 'initial',
  early: 'initial',
  seedling: 'initial',
  vegetative: 'mid',
  flowering: 'mid',
  peak: 'mid',
  mature: 'late',
  harvest: 'late',
};

/**
 * Resolve the Kc value for a given crop and growth stage.
 *
 * @param {string} crop  – Crop name (must match a key in CROP_COEFFICIENTS)
 * @param {string} stage – Growth stage keyword (see STAGE_KC_MAP)
 * @returns {{ kc: number, kcKey: string }}
 */
function resolveKc(crop, stage) {
  const entry = CROP_COEFFICIENTS[crop];
  if (!entry) {
    throw new Error(
      `Unknown crop "${crop}". Available: ${Object.keys(CROP_COEFFICIENTS).join(', ')}`
    );
  }

  const kcKey = STAGE_KC_MAP[stage.toLowerCase()] || 'mid';
  const kc = entry[kcKey] ?? entry.mid;

  return { kc, kcKey };
}

/**
 * Get the current day-of-year (1–366).
 */
function currentDOY() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 86_400_000; // ms
  return Math.floor(diff / oneDay);
}

/**
 * Work out today's crop water use and whether to irrigate.
 *
 * @param {object}  params
 * @param {string}  params.crop         – Crop name (e.g. "Tomato", "Corn")
 * @param {string}  params.stage        – Growth stage keyword (e.g. "mid", "flowering")
 * @param {number}  params.soilMoisture – Current soil moisture as fraction (0–1),
 *                                        where 1 = field capacity. Decides the advice
 *                                        (skip / check / irrigate), not an amount.
 * @param {number}  params.lat          – Latitude (decimal degrees)
 * @param {number}  params.lon          – Longitude (decimal degrees)
 * @param {number} [params.elevation=0] – Station elevation (m) for ET₀ accuracy
 * @returns {Promise<{
 *   crop:             string,
 *   stage:            string,
 *   et0:              number,
 *   kc:               number,
 *   etc:              number,
 *   advice:           'skip' | 'check' | 'irrigate',
 *   weather_cached:   boolean,
 *   weather:          object,
 *   notes:            string
 * }>}
 */
export async function planIrrigation({ crop, stage, soilMoisture = 0, lat, lon, elevation = 0 }) {
  /* 1. Fetch current weather ------------------------------------------- */
  const weather = await getWeather(lat, lon);

  /* 2. Calculate reference ET₀ ----------------------------------------- */
  const doy = currentDOY();

  const et0 = calculateET0({
    temp_c: weather.temp_c,
    humidity: weather.humidity,
    wind_ms: weather.wind_ms * WIND_10M_TO_2M,
    solar_rad: weather.solar_rad,
    elevation,
    doy,
    lat,
  });

  /* 3. Look up crop coefficient Kc ------------------------------------- */
  const { kc } = resolveKc(crop, stage);

  /* 4. Crop evapotranspiration ETc = ET₀ × Kc -------------------------- */
  const etc = parseFloat((et0 * kc).toFixed(2));

  /* 5. Decide from the soil moisture ------------------------------------ */
  //   Crop water use (ETc) does not depend on the soil; the soil tells us whether the
  //   crop needs water now. Turning that into millimetres to apply would need the soil
  //   type and root depth, which the app does not know, so we do not claim an amount.
  const clampedMoisture = Math.max(0, Math.min(1, soilMoisture));
  const advice =
    clampedMoisture >= WET_FROM ? 'skip' : clampedMoisture >= DRY_BELOW ? 'check' : 'irrigate';

  /* 6. Compose advisory note ------------------------------------------- */
  const usage = `Your crop uses about ${etc.toFixed(1)} mm of water a day.`;
  const notes = {
    skip: `Soil is wet, so skip irrigation today. ${usage} Check again in a day or two.`,
    check: `Soil moisture is fine for now. Check again tomorrow. ${usage}`,
    irrigate: `Soil is dry, so irrigate today. ${usage}`,
  }[advice];

  /* 7. Return result ---------------------------------------------------- */
  return {
    crop,
    stage,
    et0,
    kc,
    etc,
    advice,
    weather_cached: weather.weather_cached,
    weather: {
      temp_c: weather.temp_c,
      humidity: weather.humidity,
      wind_ms: weather.wind_ms,
      solar_rad: weather.solar_rad,
    },
    notes,
  };
}

export default planIrrigation;
