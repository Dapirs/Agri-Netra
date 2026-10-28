import { useState } from 'react';
import { CROP_COEFFICIENTS } from '../data/cropCoefficients';

/* ── Option lists ──────────────────────────────────────── */
const CROPS  = Object.keys(CROP_COEFFICIENTS);
const STAGES = ['Early', 'Mid', 'Late'];
const MOISTURE_LEVELS = ['Dry', 'Moist', 'Wet'];

const INITIAL = { crop: '', stage: '', lat: '', lon: '', soilMoisture: '' };

/** Turns typed text into a coordinate, or null unless it is a number within ±max. */
function parseCoordinate(text, max) {
    if (text.trim() === '') return null;
    const value = Number(text);
    return Number.isFinite(value) && Math.abs(value) <= max ? value : null;
}

/**
 * IrrigationForm
 *
 * @param {{
 *   onSubmit: (values: { crop: string, stage: string, lat: string, lon: string, soilMoisture: string }) => void,
 *   loading:  boolean,
 * }} props
 */
export default function IrrigationForm({ onSubmit, loading = false }) {
    const [values, setValues] = useState(INITIAL);
    const [touched, setTouched] = useState({});
    const [locating, setLocating] = useState(false);
    const [locationDetected, setLocationDetected] = useState(false);
    const [locationError, setLocationError] = useState('');

    const latValid = parseCoordinate(values.lat, 90) !== null;
    const lonValid = parseCoordinate(values.lon, 180) !== null;

    const isComplete =
        values.crop &&
        values.stage &&
        latValid &&
        lonValid &&
        values.soilMoisture !== '';

    const latError = touched.lat && !latValid ? 'Enter a latitude between -90 and 90.' : '';
    const lonError = touched.lon && !lonValid ? 'Enter a longitude between -180 and 180.' : '';

    const handleChange = (field) => (e) => {
        setValues((prev) => ({ ...prev, [field]: e.target.value }));
        setTouched((prev) => ({ ...prev, [field]: true }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!isComplete || loading) return;
        onSubmit?.(values);
    };

    const handleUseMyLocation = () => {
        if (!navigator.geolocation) {
            setLocationDetected(false);
            setLocationError('Geolocation is not supported on this device/browser.');
            return;
        }

        setLocating(true);
        setLocationError('');
        setLocationDetected(false);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude.toFixed(6);
                const lon = position.coords.longitude.toFixed(6);

                setValues((prev) => ({ ...prev, lat, lon }));
                setTouched((prev) => ({ ...prev, lat: true, lon: true }));
                setLocationDetected(true);
                setLocationError('');
                setLocating(false);
            },
            (error) => {
                setLocationDetected(false);
                setLocationError(`Unable to get location: ${error.message}`);
                setLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    return (
        <form className="irr-form" onSubmit={handleSubmit} noValidate aria-label="Irrigation advisor form">

            {/* ── Section label ── */}
            <div className="irr-form__heading">
                <div className="irr-form__heading-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                        <path d="M12 8v4l3 3"/>
                    </svg>
                </div>
                <div>
                    <h2 className="irr-form__title">Irrigation Advisor</h2>
                    <p className="irr-form__subtitle">Select crop details to get a recommendation</p>
                </div>
            </div>

            {/* ── Fields ── */}
            <div className="irr-form__fields">

                <SelectField
                    id="irr-crop"
                    label="Crop"
                    icon={<CropIcon />}
                    value={values.crop}
                    onChange={handleChange('crop')}
                    touched={touched.crop}
                    placeholder="Select crop"
                    options={CROPS}
                />

                <SelectField
                    id="irr-stage"
                    label="Growth Stage"
                    icon={<StageIcon />}
                    value={values.stage}
                    onChange={handleChange('stage')}
                    touched={touched.stage}
                    placeholder="Select stage"
                    options={STAGES}
                />

                <details className="irr-advanced" open>
                    <summary className="irr-advanced__summary">Advanced / Location</summary>
                    <div className="irr-advanced__content">
                        <button
                            type="button"
                            className="btn btn--secondary"
                            onClick={handleUseMyLocation}
                            disabled={loading || locating}
                        >
                            {locating ? 'Getting location...' : 'Use My Location'}
                        </button>
                        {locationDetected && (
                            <p className="irr-field__error-msg" role="status">Location detected ✓</p>
                        )}
                        {locationError && (
                            <p className="irr-field__error-msg" role="alert">{locationError}</p>
                        )}
                        <TextField
                            id="irr-lat"
                            label="Latitude"
                            icon={<PinIcon />}
                            value={values.lat}
                            onChange={handleChange('lat')}
                            error={latError}
                            placeholder="e.g. 28.6139"
                        />
                        <TextField
                            id="irr-lon"
                            label="Longitude"
                            icon={<PinIcon />}
                            value={values.lon}
                            onChange={handleChange('lon')}
                            error={lonError}
                            placeholder="e.g. 77.2090"
                        />
                    </div>
                </details>

                <SelectField
                    id="irr-soil-moisture"
                    label="Current Soil Moisture"
                    icon={<SoilIcon />}
                    value={values.soilMoisture}
                    onChange={handleChange('soilMoisture')}
                    touched={touched.soilMoisture}
                    placeholder="Select moisture level"
                    options={MOISTURE_LEVELS}
                />

            </div>

            {/* ── Submit ── */}
            <button
                id="irr-submit"
                type="submit"
                className={`btn btn--primary irr-form__submit ${loading ? 'btn--loading' : ''}`}
                disabled={!isComplete || loading}
                aria-busy={loading}
                aria-label={loading ? 'Getting recommendation…' : 'Get irrigation recommendation'}
            >
                {loading ? (
                    <>
                        <span className="spinner spinner--sm" aria-hidden="true" />
                        Getting recommendation…
                    </>
                ) : (
                    <>
                        <svg className="irr-form__submit-icon" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                             aria-hidden="true">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                        Get Recommendation
                    </>
                )}
            </button>

        </form>
    );
}

/* ─── Reusable select field ──────────────────────────────── */
function SelectField({ id, label, icon, value, onChange, touched, placeholder, options }) {
    const isError = touched && !value;

    return (
        <div className={`irr-field ${isError ? 'irr-field--error' : ''} ${value ? 'irr-field--filled' : ''}`}>
            <label className="irr-field__label" htmlFor={id}>{label}</label>
            <div className="irr-field__wrapper">
                <span className="irr-field__icon" aria-hidden="true">{icon}</span>
                <select
                    id={id}
                    className="irr-field__select"
                    value={value}
                    onChange={onChange}
                    aria-invalid={isError}
                    aria-describedby={isError ? `${id}-error` : undefined}
                    required
                >
                    <option value="" disabled>{placeholder}</option>
                    {options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
                <span className="irr-field__chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </span>
            </div>
            {isError && (
                <p id={`${id}-error`} className="irr-field__error-msg" role="alert">
                    Please select a {label.toLowerCase()}.
                </p>
            )}
        </div>
    );
}

/* ─── Reusable text field (typed coordinates) ───────────── */
function TextField({ id, label, icon, value, onChange, error, placeholder }) {
    return (
        <div className={`irr-field ${error ? 'irr-field--error' : ''} ${value ? 'irr-field--filled' : ''}`}>
            <label className="irr-field__label" htmlFor={id}>{label}</label>
            <div className="irr-field__wrapper">
                <span className="irr-field__icon" aria-hidden="true">{icon}</span>
                <input
                    id={id}
                    className="irr-field__select"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                />
            </div>
            {error && (
                <p id={`${id}-error`} className="irr-field__error-msg" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

/* ─── Inline SVG icons ───────────────────────────────────── */
function CropIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 000 20A10 10 0 0012 2z"/>
            <path d="M12 8c-2 4-2 8 0 12M12 8c2 4 2 8 0 12"/>
        </svg>
    );
}

function StageIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
        </svg>
    );
}

function SoilIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17h18M3 12h18M3 7h18"/>
        </svg>
    );
}

function PinIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/>
            <circle cx="12" cy="10" r="2.5"/>
        </svg>
    );
}
