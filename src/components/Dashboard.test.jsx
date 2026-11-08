// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import Dashboard from './Dashboard.jsx';

const NOW = new Date(2026, 10, 8, 12, 0); // Sunday 8 Nov 2026, noon (local time)
const daysAgo = (n, hour = 9) => new Date(2026, 10, 8 - n, hour, 0).toISOString();

let id = 0;
const scan = (overrides = {}) => ({
  id: `scan-${++id}`,
  timestamp: daysAgo(0),
  crop: 'Tomato',
  disease: 'Tomato Early Blight',
  confidence: 93,
  isHealthy: false,
  treatment: ['Apply mancozeb fungicide every 7–10 days.', 'Remove infected lower leaves.'],
  prevention: ['Rotate crops.'],
  ...overrides,
});
const healthy = (overrides = {}) =>
  scan({
    disease: 'Healthy Tomato',
    isHealthy: true,
    treatment: ['No treatment needed.'],
    ...overrides,
  });

const show = (history) => render(<Dashboard history={history} />).container;
const glance = () => screen.getByRole('list', { name: 'Your crops at a glance' });
const recent = () => screen.getByRole('list', { name: 'Recent scans' });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Dashboard: no health score any more', () => {
  it('shows no score, percentage label or "Critical", and no confidence chart', () => {
    const card = show([scan(), scan(), healthy()]);

    expect(card.textContent).not.toMatch(/health score|critical|at risk|confidence trend/i);
    expect(card.querySelector('.recharts-wrapper, svg[role="img"], [aria-label*="chart" i]')).toBe(
      null
    );
  });

  it('invites a first scan when there is no history', () => {
    show([]);

    expect(screen.getByText(/No scans yet/).textContent).toMatch(/Scanner/);
    expect(screen.queryByRole('list')).toBe(null);
  });
});

describe('Dashboard: your crops at a glance', () => {
  it('shows each crop once, with the status of its latest scan', () => {
    // history is stored in the order scans were made: oldest first
    show([
      scan({ crop: 'Potato', disease: 'Potato Late Blight', timestamp: daysAgo(3) }),
      healthy({ timestamp: daysAgo(2) }),
      healthy({ crop: 'Bell Pepper', disease: 'Healthy Bell Pepper', timestamp: daysAgo(1) }),
      scan({ timestamp: daysAgo(0) }),
    ]);

    const rows = within(glance()).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('b').textContent)).toEqual([
      'Tomato',
      'Bell Pepper',
      'Potato',
    ]);
    expect(rows[0].textContent).toContain('Needs care');
    expect(rows[0].textContent).toContain('Tomato Early Blight · today');
    expect(rows[1].textContent).toContain('Healthy');
    expect(rows[1].textContent).toContain('yesterday');
    expect(rows[2].textContent).toContain('Needs care');
  });

  it('describes older scans by weekday, then by date', () => {
    show([scan({ timestamp: daysAgo(10) }), scan({ crop: 'Potato', timestamp: daysAgo(4) })]);

    const text = glance().textContent;
    expect(text).toContain('Wednesday'); // 4 days before Sunday 8 Nov
    expect(text).toMatch(/29 Oct|Oct 29/); // 10 days back: a date
  });

  it('still lists scans saved before crops were recorded, just not in the crop summary', () => {
    show([
      { id: 'old', disease: 'Tomato Late Blight', confidence: 91, severity: 'High' },
      healthy(),
    ]);

    expect(within(glance()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(recent()).getAllByRole('button')).toHaveLength(2);
  });
});

describe('Dashboard: recent scans', () => {
  it('lists the five newest scans, newest first', () => {
    const history = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      scan({ disease: `Scan ${n}`, timestamp: daysAgo(7 - n) })
    );
    show(history);

    const names = within(recent())
      .getAllByRole('button')
      .map((b) => b.querySelector('b').textContent);
    expect(names).toEqual(['Scan 7', 'Scan 6', 'Scan 5', 'Scan 4', 'Scan 3']);
  });

  it('re-opens the treatment of a past scan when tapped, with the safety note', () => {
    show([scan()]);
    const row = within(recent()).getByRole('button');
    const panel = () => document.getElementById(row.getAttribute('aria-controls'));

    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(panel().hasAttribute('inert')).toBe(true);

    fireEvent.click(row);

    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(panel().hasAttribute('inert')).toBe(false);
    expect(
      within(panel())
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Apply mancozeb fungicide every 7–10 days.', 'Remove infected lower leaves.']);
    expect(panel().textContent).toContain('Krishi Vigyan Kendra');

    fireEvent.click(row);

    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows no safety note when a healthy scan is re-opened', () => {
    show([healthy()]);

    fireEvent.click(within(recent()).getByRole('button'));

    expect(recent().textContent).not.toContain('Krishi Vigyan Kendra');
  });

  it('marks healthy and diseased scans in words, not only by colour', () => {
    show([scan(), healthy()]);

    const [newest, older] = within(recent()).getAllByRole('button');
    expect(newest.getAttribute('aria-label') ?? newest.textContent).toMatch(/healthy/i);
    expect(older.getAttribute('aria-label') ?? older.textContent).toMatch(/needs care/i);
  });

  it('keeps each scan in its own row when the list changes (stable keys)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = scan({ disease: 'First scan', timestamp: daysAgo(1) });
    const { rerender } = render(<Dashboard history={[first]} />);
    fireEvent.click(within(recent()).getByRole('button'));

    rerender(<Dashboard history={[first, healthy({ disease: 'New scan' })]} />);

    const rows = within(recent()).getAllByRole('button');
    expect(rows[0].textContent).toContain('New scan');
    expect(rows[0].getAttribute('aria-expanded')).toBe('false'); // the new row is closed
    expect(rows[1].getAttribute('aria-expanded')).toBe('true'); // the opened one stays open
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
