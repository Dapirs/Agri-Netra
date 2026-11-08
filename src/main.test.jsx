// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { act } from 'react';

// The labels request never finishes, like a hung connection on a slow rural network.
const mocks = vi.hoisted(() => ({ loadLabels: vi.fn(() => new Promise(() => {})) }));
vi.mock('./logic/predictionMapper.js', () => ({ initializePredictionLabels: mocks.loadLabels }));
vi.mock('./App.jsx', () => ({ default: () => <p>app shell</p> }));

it('shows the app straight away instead of waiting for the labels file', async () => {
  document.body.innerHTML = '<div id="root"></div>';

  await act(async () => {
    await import('./main.jsx');
  });

  expect(document.getElementById('root').textContent).toBe('app shell');
  expect(mocks.loadLabels).toHaveBeenCalledTimes(1); // still loaded, just in the background
});
