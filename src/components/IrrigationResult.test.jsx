// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import IrrigationResult from './IrrigationResult.jsx';

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

const show = (overrides = {}) =>
  render(<IrrigationResult result={{ ...base, ...overrides }} />).container;
const toggle = () => screen.getByRole('button', { name: /the numbers/ });
const numbers = () => document.getElementById(toggle().getAttribute('aria-controls'));

afterEach(cleanup);

describe('IrrigationResult: the decision comes first', () => {
  it.each([
    ['irrigate', 'Irrigate today', 'The soil is dry.'],
    ['check', 'Check tomorrow', 'The soil is moist enough for now.'],
    ['skip', 'Skip today', 'The soil is wet, so no water is needed.'],
  ])('shows the advice "%s" as the heading "%s", with the reason', (advice, heading, reason) => {
    const card = show({ advice });

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(heading);
    expect(card.querySelector('[data-advice]').dataset.advice).toBe(advice);
    expect(card.textContent).toContain(reason);
  });

  it('says how much water the crop uses today, in plain words', () => {
    show();

    expect(screen.getByText(/In this weather your tomato uses about/).textContent).toBe(
      'The soil is dry. In this weather your tomato uses about 7.3 mm of water a day.'
    );
  });

  it("takes the crop's water use from the planner, not by recomputing ET₀ × Kc", () => {
    show({ et0: 6.31, kc: 1.15, etc: 9.96 });
    fireEvent.click(toggle());

    expect(screen.getByText(/uses about/).textContent).toContain('10.0 mm');
    expect(numbers().textContent).toContain('10.0 mm/day');
    expect(numbers().textContent).not.toContain('7.3');
  });

  it('shows the weather briefly', () => {
    const card = show({ weather: { temp_c: 29.6, humidity: 81, wind_ms: 2.46 } });

    expect(card.textContent).toContain('30 °C');
    expect(card.textContent).toContain('81% humidity');
    expect(card.textContent).toContain('2.5 m/s');
  });

  it.each([
    ['temp_c', '°C'],
    ['humidity', 'humidity'],
    ['wind_ms', 'm/s'],
  ])('leaves out the %s reading when the weather does not have it', (missing, unit) => {
    const weather = { temp_c: 29.6, humidity: 81, wind_ms: 2.46, [missing]: null };
    const card = show({ weather });

    expect(card.querySelector('.irr-result__weather').textContent).not.toContain(unit);
    expect(card.textContent).not.toContain('NaN');
  });

  it('never shows the old "water needed" amount or an irrigation depth', () => {
    const card = show();

    expect(card.textContent).not.toMatch(/Water Needed|irrigation depth|Depth/i);
  });

  it('notes when the weather is a saved copy, and only then', () => {
    expect(show({ weather_cached: true }).textContent).toContain('Using saved weather');
    cleanup();
    expect(show({ weather_cached: false }).textContent).not.toContain('Using saved weather');
  });

  it('renders nothing without a result', () => {
    const { container } = render(<IrrigationResult result={null} />);

    expect(container.innerHTML).toBe('');
  });
});

describe('IrrigationResult: the numbers stay folded away until asked for', () => {
  it('starts with the numbers hidden, also from screen readers', () => {
    show();

    expect(toggle().textContent).toContain('Show the numbers');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(numbers().hasAttribute('inert')).toBe(true);
  });

  it('opens and closes the numbers: ET₀, Kc and ETc with plain names', () => {
    show();

    fireEvent.click(toggle());

    expect(toggle().textContent).toContain('Hide the numbers');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(numbers().hasAttribute('inert')).toBe(false);
    expect(numbers().textContent).toContain("How strongly today's weather dries plants");
    expect(numbers().textContent).toContain('6.3 mm/day');
    expect(numbers().textContent).toContain('1.15');
    expect(numbers().textContent).toContain('7.3 mm/day');

    fireEvent.click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(numbers().hasAttribute('inert')).toBe(true);
  });
});
