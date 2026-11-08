// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from './App.jsx';

// The real Scanner loads the TF.js model; this stand-in reports a diagnosis when clicked.
vi.mock('./components/Scanner', () => ({
  default: ({ onResult }) => (
    <button
      onClick={() =>
        onResult({
          label: 'Tomato Early Blight',
          disease: 'Tomato Early Blight',
          confidence: 93,
          isHealthy: false,
          treatment: 'Remove infected leaves.',
          prevention: 'Rotate crops.',
        })
      }
    >
      fake scan
    </button>
  ),
}));

// No network: the planner answers straight away.
vi.mock('./logic/irrigationPlanner', () => ({
  planIrrigation: vi.fn(async () => ({
    crop: 'Tomato',
    stage: 'Mid',
    et0: 6.31,
    kc: 1.15,
    etc: 7.26,
    advice: 'irrigate',
    notes: 'Soil is dry, so irrigate today.',
    weather_cached: false,
    weather: { temp_c: 30, humidity: 50, wind_ms: 2.5, solar_rad: 300 },
  })),
}));

let scrollIntoView;

beforeEach(() => {
  localStorage.clear();
  // jsdom has no scrolling; record which element asked to be scrolled into view.
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  delete Element.prototype.scrollIntoView;
});

const scrolledTo = () => scrollIntoView.mock.contexts.map((el) => el.getAttribute('aria-label'));

describe('App scrolls a new result into view', () => {
  it('scrolls to the diagnosis when a scan finishes', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));

    expect(screen.getByRole('article', { name: 'Diagnosis result' })).toBeTruthy();
    expect(scrolledTo()).toEqual(['Diagnosis result']);
  });

  it('scrolls to the recommendation when an irrigation plan arrives', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Irrigation' }));

    const set = (label, value) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    set('Crop', 'Tomato');
    set('Growth Stage', 'Mid');
    set('Latitude', '12.97');
    set('Longitude', '77.59');
    set('Current Soil Moisture', 'Dry');
    fireEvent.click(screen.getByRole('button', { name: 'Get irrigation recommendation' }));

    await screen.findByRole('article', { name: 'Irrigation recommendation' });
    expect(scrolledTo()).toEqual(['Irrigation recommendation']);
  });

  it('does not scroll to an old result when the user comes back to the Scanner tab', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));
    scrollIntoView.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scanner' }));

    expect(screen.getByRole('article', { name: 'Diagnosis result' })).toBeTruthy();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
