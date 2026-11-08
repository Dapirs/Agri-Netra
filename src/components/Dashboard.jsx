import { useId, useState } from 'react';
import { Advice, SafetyNote } from './Advice.jsx';

/* ─── helpers ──────────────────────────────────────────── */
const normalize = (v) => (v ?? '').toString().toLowerCase().trim();

/** Scans saved before severity was removed have no isHealthy; their severity "None" meant healthy. */
function isHealthyScan(scan) {
  return scan.isHealthy ?? normalize(scan.severity) === 'none';
}

/** "today", "yesterday", a weekday within the last week, otherwise a short date. */
function dayLabel(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((midnight(new Date()) - midnight(date)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function timeLabel(timestamp) {
  if (!timestamp) return '';
  const day = dayLabel(timestamp);
  const time = new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${time}`;
}

const statusText = (healthy) => (healthy ? 'Healthy' : 'Needs care');

/* ═══════════════════════════════════════════════════════
   Dashboard: your crops at a glance, and recent scans that
   re-open their treatment. History is stored oldest first.
═══════════════════════════════════════════════════════ */
/**
 * @param {{ history: Array<{
 *   id?: string, timestamp?: string, crop?: string, disease: string,
 *   isHealthy?: boolean, treatment?: string[] | string,
 * }> }} props
 */
export default function Dashboard({ history = [] }) {
  if (history.length === 0) {
    return (
      <section className="dashboard" aria-label="Your scans">
        <div className="dash-card dash-empty">
          <LeafIcon />
          <p>No scans yet. Scan a leaf on the Scanner tab and it will show up here.</p>
        </div>
      </section>
    );
  }

  const newestFirst = [...history].reverse();

  /* Latest scan of each crop; scans saved before crops were recorded are left out */
  const latestByCrop = new Map();
  for (const scan of newestFirst) {
    if (scan.crop && !latestByCrop.has(scan.crop)) latestByCrop.set(scan.crop, scan);
  }

  return (
    <section className="dashboard" aria-label="Your scans">
      {latestByCrop.size > 0 && (
        <div className="dash-card">
          <h2 className="dash-card__title">Your crops at a glance</h2>
          <ul className="dash-list" aria-label="Your crops at a glance">
            {[...latestByCrop.values()].map((scan) => {
              const healthy = isHealthyScan(scan);
              return (
                <li key={scan.crop} className="dash-crop">
                  <StatusIcon healthy={healthy} />
                  <span className="dash-crop__text">
                    <b>{scan.crop}</b>
                    <span>
                      {healthy ? 'Healthy' : scan.disease} · {dayLabel(scan.timestamp)}
                    </span>
                  </span>
                  <span className={`dash-pill ${healthy ? 'dash-pill--ok' : 'dash-pill--care'}`}>
                    {statusText(healthy)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="dash-card">
        <h2 className="dash-card__title">Recent scans</h2>
        <ul className="dash-list" aria-label="Recent scans">
          {newestFirst.slice(0, 5).map((scan) => (
            <RecentScan key={scan.id ?? scan.timestamp} scan={scan} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** One past scan; tapping it re-opens what to do, like the result card did. */
function RecentScan({ scan }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const healthy = isHealthyScan(scan);

  return (
    <li className="dash-scan" data-open={open}>
      <button
        type="button"
        className="dash-scan__button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <StatusIcon healthy={healthy} />
        <span className="dash-scan__text">
          <b>{scan.disease}</b>
          <span>
            {statusText(healthy)}
            {scan.timestamp && ` · ${timeLabel(scan.timestamp)}`}
          </span>
        </span>
        <ChevronIcon />
      </button>
      {/* Stays in the page so it can slide open; `inert` hides it from taps and screen readers */}
      <div id={panelId} className="dash-scan__panel" inert={!open}>
        <div>
          <div className="dash-scan__advice">
            <Advice value={scan.treatment} fallback="No treatment was saved for this scan." />
            {!healthy && <SafetyNote />}
          </div>
        </div>
      </div>
    </li>
  );
}

/* ── Icons ───────────────────────────────────────────────── */
function StatusIcon({ healthy }) {
  return (
    <span
      className={`dash-icon ${healthy ? 'dash-icon--ok' : 'dash-icon--care'}`}
      aria-hidden="true"
    >
      {healthy ? <LeafIcon /> : <CareIcon />}
    </span>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 4c-7 0-12 3.5-13.3 9.6-.4 1.8-.3 3.4.1 4.7L4.3 20.8l1.4 1.4 2.4-2.4c1.2.6 2.6.8 4.1.6C18.4 19.6 20.6 12 20 4z" />
    </svg>
  );
}

function CareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="dash-scan__chev"
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
