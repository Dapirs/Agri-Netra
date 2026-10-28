/**
 * Prediction Mapper
 * ─────────────────
 * Maps a CNN model prediction (class index + probability array) to a
 * human-readable result object with disease info and care advice.
 *
 * No external dependencies – uses only the local data modules.
 */

import { DISEASE_LABELS } from '../data/diseaseLabels.js';
import { TREATMENT_DB } from '../data/treatmentDB.js';

let runtimeLabels = [...DISEASE_LABELS];

function normalizeClassIndexMap(indexMap) {
    if (!indexMap || typeof indexMap !== 'object') return [];

    const entries = Object.entries(indexMap)
        .map(([key, value]) => ({
            index: Number.parseInt(key, 10),
            label: typeof value === 'string' ? value : '',
        }))
        .filter((entry) => Number.isInteger(entry.index) && entry.index >= 0 && entry.label)
        .sort((a, b) => a.index - b.index);

    // Indices must run 0..n-1 with no gaps or duplicates; otherwise labels would
    // silently shift onto the wrong classes.
    if (!entries.every((entry, position) => entry.index === position)) return [];

    return entries.map((entry) => entry.label);
}

/**
 * Loads class labels once at startup from /model/class_indices.json.
 * Falls back to static labels if the fetch fails.
 */
export async function initializePredictionLabels() {
    try {
        const response = await fetch('/model/class_indices.json');
        if (!response.ok) {
            throw new Error(`Failed to load class indices: HTTP ${response.status}`);
        }

        const indexMap = await response.json();
        const labels = normalizeClassIndexMap(indexMap);

        if (labels.length > 0) {
            runtimeLabels = labels;
        } else {
            console.error('[predictionMapper] class_indices.json has no usable labels; using fallback labels');
        }
    } catch (err) {
        console.error('[predictionMapper] Using fallback labels:', err);
        runtimeLabels = [...DISEASE_LABELS];
    }
}

/**
 * Map a model prediction to a structured result.
 *
 * @param {number}   index               – Predicted class index (an integer, 0–37)
 * @param {number[]} probabilitiesArray   – Full softmax probability array. Must have
 *                                          one entry per class label, otherwise the
 *                                          model and labels are out of sync and an
 *                                          Error is thrown.
 * @returns {{
 *   disease:    string,
 *   confidence: number,
 *   isHealthy:  boolean,
 *   treatment:  string[],
 *   prevention: string[],
 *   displayName: string,
 *   crop:        string,
 *   symptoms:    string[],
 *   topK:        {label: string, probability: number}[]
 * }}
 */
export function mapPrediction(index, probabilitiesArray) {
    /* 1. Validate index --------------------------------------------------- */
    if (!Number.isInteger(index) || index < 0 || index >= runtimeLabels.length) {
        throw new RangeError(
            `Prediction index ${index} is out of range (0–${runtimeLabels.length - 1}).`
        );
    }

    // A length mismatch means the model and the labels disagree, so any label we
    // showed could be the wrong disease. Fail loudly instead.
    if (probabilitiesArray && probabilitiesArray.length !== runtimeLabels.length) {
        throw new Error(
            `Model returned ${probabilitiesArray.length} probabilities but there are ` +
            `${runtimeLabels.length} class labels (model and labels are out of sync).`
        );
    }

    /* 2. Look up label & confidence -------------------------------------- */
    const label = runtimeLabels[index];
    const confidence = probabilitiesArray?.[index] ?? 0;
    const isHealthy = label.toLowerCase().includes('healthy');

    /* 3. Look up treatment database -------------------------------------- */
    const entry = TREATMENT_DB[label] || {};

    const disease     = entry.displayName || label;
    const crop        = entry.crop        || label.split('___')[0].replace(/_/g, ' ');
    const symptoms    = entry.symptoms    || [];
    const treatment   = entry.treatment   || ['No treatment data available.'];
    const prevention  = entry.prevention  || ['No prevention data available.'];

    /* 4. Top-K predictions (useful for differential diagnosis) ------------ */
    const topK = probabilitiesArray
        ? [...probabilitiesArray]
            .map((prob, i) => ({
                label: runtimeLabels[i] ?? DISEASE_LABELS[i] ?? `Class ${i}`,
                probability: prob,
            }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 5)
        : [{ label, probability: confidence }];

    /* 5. Return structured result ----------------------------------------- */
    return {
        disease,
        confidence: parseFloat(confidence.toFixed(4)),
        isHealthy,
        treatment,
        prevention,
        // Bonus context fields
        displayName: disease,
        crop,
        symptoms,
        topK,
    };
}

export default mapPrediction;
