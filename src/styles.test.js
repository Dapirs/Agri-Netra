import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Farmers read this outdoors on phones: no text in the stylesheet may be smaller than 13px.
const MIN_PX = 13;
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

/** Every `font-size` in index.css, in px, with the selector it belongs to. */
function fontSizes() {
  const sizes = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const [, value, unit] of body.matchAll(/font-size:\s*([\d.]+)(rem|em|px)/g)) {
      const px = unit === 'px' ? Number(value) : Number(value) * 16;
      sizes.push({ selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(), px });
    }
  }
  return sizes;
}

describe('index.css text size', () => {
  it('finds the font sizes it is checking', () => {
    expect(fontSizes().length).toBeGreaterThan(30);
  });

  it(`has no font-size below ${MIN_PX}px`, () => {
    const tooSmall = fontSizes()
      .filter(({ px }) => px < MIN_PX)
      .map(({ selector, px }) => `${selector}: ${px.toFixed(1)}px`);

    expect(tooSmall).toEqual([]);
  });
});
