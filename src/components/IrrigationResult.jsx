import { useId, useState } from 'react';

/* The decision, in plain words. Each state has its own word and icon, so the
   meaning never depends on the shade of green alone. */
const ADVICE = {
  irrigate: { title: 'Irrigate today', reason: 'The soil is dry.', Icon: DropIcon },
  check: { title: 'Check tomorrow', reason: 'The soil is moist enough for now.', Icon: ClockIcon },
  skip: { title: 'Skip today', reason: 'The soil is wet, so no water is needed.', Icon: LeafIcon },
};

/**
 * IrrigationResult
 * The decision first; ET₀, Kc and ETc only when the farmer asks for the numbers.
 *
 * @param {{
 *   result: {
 *     crop:           string,
 *     stage:          string,
 *     et0:            number,   // reference evapotranspiration (mm/day)
 *     kc:             number,   // crop coefficient
 *     etc:            number,   // crop water use today (mm/day)
 *     advice:         'skip' | 'check' | 'irrigate',
 *     weather_cached: boolean,  // true = saved weather, not live
 *     weather:        { temp_c?: number, humidity?: number, wind_ms?: number },
 *   },
 *   ref?: import('react').Ref<HTMLElement>,
 * }} props
 */
export default function IrrigationResult({ result, ref }) {
  const [open, setOpen] = useState(false);
  const numbersId = useId();

  if (!result) return null;

  const { crop, stage, et0, kc, etc, advice, weather_cached, weather } = result;
  const { title, reason, Icon } = ADVICE[advice];

  return (
    <article
      ref={ref}
      className="irr-result"
      data-advice={advice}
      data-open={open}
      aria-label="Irrigation recommendation"
    >
      <div className="irr-result__body">
        <p className="irr-result__meta">
          <b>{crop}</b> · {stage} stage
        </p>

        <div className="irr-result__decision">
          <div className="irr-result__icon" aria-hidden="true">
            <Icon />
          </div>
          <h2>{title}</h2>
        </div>

        {weather_cached && (
          <p className="irr-result__note" role="note">
            Using saved weather from earlier. Live conditions may differ.
          </p>
        )}

        <p className="irr-result__why">
          {reason} In this weather your {crop.toLowerCase()} uses about <b>{etc.toFixed(1)} mm</b>{' '}
          of water a day.
        </p>

        <WeatherSummary weather={weather} />
      </div>

      <button
        type="button"
        className="irr-result__toggle"
        aria-expanded={open}
        aria-controls={numbersId}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        {open ? 'Hide the numbers' : 'Show the numbers'}
        <ChevronIcon />
      </button>

      {/* Stays in the page so it can slide open; `inert` hides it from taps and screen readers */}
      <div id={numbersId} className="irr-result__numbers" inert={!open}>
        <div>
          <dl className="irr-result__rows">
            <div className="irr-result__row">
              <dt>
                How strongly today&apos;s weather dries plants<small>ET₀ (FAO-56)</small>
              </dt>
              <dd>{et0.toFixed(1)} mm/day</dd>
            </div>
            <div className="irr-result__row">
              <dt>
                {crop} factor at {stage.toLowerCase()} stage<small>Kc</small>
              </dt>
              <dd>{kc.toFixed(2)}</dd>
            </div>
            <div className="irr-result__row">
              <dt>
                Your crop&apos;s water use<small>ETc = ET₀ × Kc</small>
              </dt>
              <dd>{etc.toFixed(1)} mm/day</dd>
            </div>
          </dl>
        </div>
      </div>
    </article>
  );
}

/** Temperature, humidity and wind on one line; readings that are missing are left out. */
function WeatherSummary({ weather }) {
  if (!weather) return null;
  const { temp_c, humidity, wind_ms } = weather;

  return (
    <p className="irr-result__weather">
      {temp_c != null && (
        <span>
          <ThermometerIcon /> {Math.round(temp_c)} °C
        </span>
      )}
      {humidity != null && (
        <span>
          <HumidityIcon /> {Math.round(humidity)}% humidity
        </span>
      )}
      {wind_ms != null && (
        <span>
          <WindIcon /> {Number(wind_ms).toFixed(1)} m/s
        </span>
      )}
    </p>
  );
}

/* ── Icons ───────────────────────────────────────────────── */
function DropIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.5c-.3 0-.6.2-.8.4C9.6 5 5 11 5 14.5A7 7 0 0 0 19 14.5C19 11 14.4 5 12.8 2.9c-.2-.2-.5-.4-.8-.4z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 4c-7 0-12 3.5-13.3 9.6-.4 1.8-.3 3.4.1 4.7L4.3 20.8l1.4 1.4 2.4-2.4c1.2.6 2.6.8 4.1.6C18.4 19.6 20.6 12 20 4zm-8.1 14.4c-1 .1-1.9 0-2.7-.3l5.5-5.5-1.4-1.4-5.5 5.5c-.2-.9-.2-1.9 0-3 1-4.6 4.6-7.4 10.2-7.7-.3 6.6-2.4 11.8-6.1 12.4z" />
    </svg>
  );
}

function ThermometerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z" />
    </svg>
  );
}

function HumidityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
    </svg>
  );
}

function WindIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 8h11a3 3 0 1 0-3-3M3 16h15a3 3 0 1 1-3 3M3 12h7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="irr-result__chev"
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
