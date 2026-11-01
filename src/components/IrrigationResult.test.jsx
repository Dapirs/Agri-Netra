import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import IrrigationResult from './IrrigationResult.jsx';

const render = (overrides = {}) =>
  renderToStaticMarkup(<IrrigationResult result={{ ...base, ...overrides }} />);

const base = {
  crop: 'Tomato',
  stage: 'Mid',
  et0: 6.31,
  kc: 1.15,
  etc: 7.26,
  advice: 'irrigate',
  notes: 'Soil is dry, so irrigate today.',
  weather_cached: false,
  weather: { temp_c: 30, humidity: 50, wind_ms: 2.5, solar_rad: 300 },
};

describe('IrrigationResult', () => {
  it('shows the crop water use as the main number', () => {
    const html = render();

    expect(html).toContain('7.3');
    expect(html).toContain('Crop Water Use Today');
  });

  it('no longer shows a "water needed" amount or an irrigation depth', () => {
    const html = render();

    expect(html).not.toMatch(/Water Needed/i);
    expect(html).not.toMatch(/irrigation depth/i);
    expect(html).not.toContain('Depth');
  });

  it.each([
    ['skip', 'Skip today'],
    ['check', 'Check tomorrow'],
    ['irrigate', 'Irrigate'],
  ])('shows the advice "%s" as "%s"', (advice, label) => {
    expect(render({ advice })).toContain(`aria-label="Advice: ${label}"`);
  });

  it.each([
    ['skip', '#4ade80'],
    ['check', '#facc15'],
    ['irrigate', '#f87171'],
  ])('colours the main number by the advice "%s"', (advice, colour) => {
    expect(render({ advice })).toContain(`color:${colour}`);
  });

  it('shows the advisory note', () => {
    expect(render()).toContain('Soil is dry, so irrigate today.');
  });

  it('warns when the weather data is cached', () => {
    expect(render({ weather_cached: true })).toContain('cached weather data');
    expect(render({ weather_cached: false })).not.toContain('cached weather data');
  });

  it('renders nothing without a result', () => {
    expect(renderToStaticMarkup(<IrrigationResult result={null} />)).toBe('');
  });
});
