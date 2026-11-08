import { describe, it, expect } from 'vitest';
import { cropCoverage } from './cropCoverage.js';
import { DISEASE_LABELS } from '../data/diseaseLabels.js';

const byName = (name) => cropCoverage().find((c) => c.crop === name);

describe('cropCoverage: what the model can check, per crop', () => {
  it('lists the 14 crops the model knows, in alphabetical order', () => {
    const names = cropCoverage().map((c) => c.crop);

    expect(names).toHaveLength(14);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toContain('Bell Pepper');
    expect(names).toContain('Corn (Maize)');
  });

  it('accounts for every class the model can answer, once', () => {
    const counted = cropCoverage().reduce((n, c) => n + c.diseases.length + (c.healthy ? 1 : 0), 0);

    expect(counted).toBe(DISEASE_LABELS.length);
  });

  it('names diseases without repeating the crop', () => {
    expect(byName('Apple')).toEqual({
      crop: 'Apple',
      healthy: true,
      diseases: ['Scab', 'Black Rot', 'Cedar Apple Rust'],
    });
    expect(byName('Corn (Maize)').diseases).toEqual([
      'Gray Leaf Spot',
      'Common Rust',
      'Northern Leaf Blight',
    ]);
    expect(byName('Bell Pepper').diseases).toEqual(['Bacterial Spot']);
  });

  it('marks crops it can only call healthy, and crops it cannot call healthy', () => {
    for (const crop of ['Blueberry', 'Raspberry', 'Soybean']) {
      expect(byName(crop)).toMatchObject({ healthy: true, diseases: [] });
    }
    expect(byName('Orange')).toEqual({
      crop: 'Orange',
      healthy: false,
      diseases: ['Citrus Greening (HLB)'],
    });
    expect(byName('Squash')).toMatchObject({ healthy: false, diseases: ['Powdery Mildew'] });
  });
});
