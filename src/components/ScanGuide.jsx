import { useEffect, useId, useRef, useState } from 'react';
import { cropCoverage } from '../logic/cropCoverage.js';

const TIPS = [
  {
    title: 'One leaf, filling the frame',
    detail: 'Close up, the whole leaf in view',
    Icon: LeafIcon,
  },
  { title: 'Plain background', detail: 'Hold a sheet of paper behind it', Icon: PaperIcon },
  { title: 'Daylight, no harsh sun', detail: 'Avoid shadows and glare', Icon: SunIcon },
  { title: 'Hold still', detail: 'A sharp photo, not blurry', Icon: CameraIcon },
];

const CROPS = cropCoverage();

/** What the scan can tell for one crop, in plain words. */
function coverageText({ healthy, diseases }) {
  if (diseases.length === 0) return 'Can say if healthy, cannot spot diseases';
  if (!healthy) return `${diseases.join(', ')} only, cannot say if healthy`;
  return diseases.join(', ');
}

/**
 * Photo tips and the list of crops the model knows, folded away under the scan buttons.
 * Scanner owns whether the tips are open, so "See photo tips" on its error can open them.
 *
 * @param {{ tipsOpen: boolean, onTipsOpenChange: (open: boolean) => void }} props
 */
export default function ScanGuide({ tipsOpen, onTipsOpenChange }) {
  const [cropsOpen, setCropsOpen] = useState(false);

  return (
    <section className="scan-guide" aria-label="Help with scanning">
      <Fold title="Photo tips" open={tipsOpen} onToggle={() => onTipsOpenChange(!tipsOpen)}>
        <ul className="scan-guide__tips">
          {TIPS.map((tip) => (
            <li key={tip.title} className="scan-guide__tip">
              <span className="scan-guide__icon" aria-hidden="true">
                <tip.Icon />
              </span>
              <span>
                <b>{tip.title}</b>
                <span>{tip.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Fold>

      <Fold
        title={`Which crops can I scan? (${CROPS.length})`}
        open={cropsOpen}
        onToggle={() => setCropsOpen((isOpen) => !isOpen)}
      >
        <ul className="scan-guide__crops">
          {CROPS.map((info) => {
            const partial = info.diseases.length === 0 || !info.healthy;
            return (
              <li key={info.crop} className="scan-guide__crop">
                <b>{info.crop}</b>
                <span className={partial ? 'scan-guide__partial' : undefined}>
                  {coverageText(info)}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="scan-guide__note">
          Other crops, like rice, wheat or cotton, cannot be scanned yet.
        </p>
      </Fold>
    </section>
  );
}

/** A row that slides its content open, like "Show the numbers" on the irrigation card. */
function Fold({ title, open, onToggle, children }) {
  const panelId = useId();
  const foldRef = useRef(null);
  const panelRef = useRef(null);

  // An opened fold can end below the screen (or behind the bottom nav), so bring it
  // into view, title included: after the slide-open finishes, or at once with reduced motion.
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;

    const reveal = () => foldRef.current?.scrollIntoView?.({ block: 'nearest' });
    if (!(parseFloat(getComputedStyle(panel).transitionDuration) > 0)) {
      reveal();
      return;
    }
    // Only the panel's own slide counts, not transitions inside it.
    const onSlideEnd = (event) => event.target === panel && reveal();
    panel.addEventListener('transitionend', onSlideEnd);
    return () => panel.removeEventListener('transitionend', onSlideEnd);
  }, [open]);

  return (
    <div ref={foldRef} className="scan-guide__fold" data-open={open}>
      <button
        type="button"
        className="scan-guide__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        {title}
        <ChevronIcon />
      </button>
      {/* Stays in the page so it can slide open; `inert` hides it from taps and screen readers */}
      <div ref={panelRef} id={panelId} className="scan-guide__panel" inert={!open}>
        <div>{children}</div>
      </div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────── */
function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 4c-7 0-12 3.5-13.3 9.6-.4 1.8-.3 3.4.1 4.7L4.3 20.8l1.4 1.4 2.4-2.4c1.2.6 2.6.8 4.1.6C18.4 19.6 20.6 12 20 4z" />
    </svg>
  );
}

function PaperIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="scan-guide__chev"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
