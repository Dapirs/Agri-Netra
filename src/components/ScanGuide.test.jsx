// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ScanGuide from './ScanGuide.jsx';

/** Scanner owns whether the tips are open, so its error message can open them. */
function Host() {
  const [tipsOpen, setTipsOpen] = useState(false);
  return <ScanGuide tipsOpen={tipsOpen} onTipsOpenChange={setTipsOpen} />;
}

const show = () => render(<Host />);
const tipsButton = () => screen.getByRole('button', { name: /Photo tips/ });
const cropsButton = () => screen.getByRole('button', { name: /Which crops can I scan/ });
const panelOf = (button) => document.getElementById(button.getAttribute('aria-controls'));
const foldOf = (button) => button.parentElement; // the title row and its panel
const cropRow = (name) =>
  within(panelOf(cropsButton()))
    .getAllByRole('listitem')
    .find((li) => li.querySelector('b')?.textContent === name);

afterEach(cleanup);

describe('ScanGuide: two folds, closed until asked for', () => {
  it('starts with both folds closed, also for screen readers', () => {
    show();

    for (const button of [tipsButton(), cropsButton()]) {
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(panelOf(button).hasAttribute('inert')).toBe(true);
    }
  });

  it('opens and closes the photo tips', () => {
    show();

    fireEvent.click(tipsButton());

    expect(tipsButton().getAttribute('aria-expanded')).toBe('true');
    expect(panelOf(tipsButton()).hasAttribute('inert')).toBe(false);
    const tips = within(panelOf(tipsButton())).getAllByRole('listitem');
    expect(tips.map((tip) => tip.querySelector('b').textContent)).toEqual([
      'One leaf, filling the frame',
      'Plain background',
      'Daylight, no harsh sun',
      'Hold still',
    ]);
    expect(cropsButton().getAttribute('aria-expanded')).toBe('false'); // the other fold stays shut

    fireEvent.click(tipsButton());

    expect(tipsButton().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('ScanGuide: which crops can be scanned', () => {
  it('counts the crops in its title and lists every one', () => {
    show();
    fireEvent.click(cropsButton());

    expect(cropsButton().textContent).toContain('(14)');
    expect(within(panelOf(cropsButton())).getAllByRole('listitem')).toHaveLength(14);
  });

  it('names the diseases it can find for a crop', () => {
    show();
    fireEvent.click(cropsButton());

    expect(cropRow('Potato').textContent).toContain('Early Blight, Late Blight');
    expect(cropRow('Tomato').textContent).toContain('Mosaic Virus');
  });

  it('says in words where a crop is only partly covered', () => {
    show();
    fireEvent.click(cropsButton());

    expect(cropRow('Soybean').textContent).toMatch(/cannot spot diseases/);
    expect(cropRow('Orange').textContent).toMatch(
      /Citrus Greening \(HLB\) only.*cannot say if healthy/
    );
    expect(cropRow('Squash').textContent).toMatch(/cannot say if healthy/);
    expect(cropRow('Potato').textContent).not.toMatch(/cannot/);
  });

  it('says that other crops cannot be scanned yet', () => {
    show();

    expect(panelOf(cropsButton()).textContent).toMatch(/rice, wheat or cotton/);
  });
});

describe('ScanGuide: an opened fold comes into view', () => {
  let scrollIntoView;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    delete Element.prototype.scrollIntoView;
  });

  it('scrolls the opened fold into view once it finishes sliding open', () => {
    show();
    panelOf(cropsButton()).style.transitionDuration = '0.35s'; // as in the real stylesheet

    fireEvent.click(cropsButton());
    expect(scrollIntoView).not.toHaveBeenCalled(); // still sliding

    fireEvent.transitionEnd(panelOf(cropsButton()).querySelector('li')); // a row's own transition
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.transitionEnd(panelOf(cropsButton()));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // the whole fold, so its title stays in view above a long list
    expect(scrollIntoView.mock.contexts[0]).toBe(foldOf(cropsButton()));
  });

  it('scrolls straight away with reduced motion, and not on closing', () => {
    show();

    fireEvent.click(tipsButton());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(foldOf(tipsButton()));

    fireEvent.click(tipsButton());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
