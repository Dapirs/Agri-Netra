import { DISEASE_LABELS } from '../data/diseaseLabels.js';
import { TREATMENT_DB } from '../data/treatmentDB.js';

/** "Apple Scab" → "Scab"; "Corn Gray Leaf Spot" for "Corn (Maize)" → "Gray Leaf Spot". */
function withoutCrop(name, crop) {
  const prefix = `${crop.replace(/\s*\(.*\)$/, '')} `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/**
 * The crops the model knows, each with whether it can tell a healthy leaf and which
 * diseases it can find, built from the model's own class labels.
 *
 * @returns {{ crop: string, healthy: boolean, diseases: string[] }[]} sorted by crop name
 */
export function cropCoverage() {
  const crops = new Map();
  for (const label of DISEASE_LABELS) {
    const entry = TREATMENT_DB[label] ?? {};
    const crop = entry.crop ?? label.split('___')[0].replace(/_/g, ' ');
    const info = crops.get(crop) ?? { crop, healthy: false, diseases: [] };
    if (label.toLowerCase().includes('healthy')) info.healthy = true;
    else info.diseases.push(withoutCrop(entry.displayName ?? label, crop));
    crops.set(crop, info);
  }
  return [...crops.values()].sort((a, b) => a.crop.localeCompare(b.crop));
}
