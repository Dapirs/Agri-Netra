/* ── Status config ───────────────────────────────────────── */
const STATUS_CONFIG = {
    healthy:  { label: 'Healthy',  className: 'badge--green', icon: '✓' },
    diseased: { label: 'Diseased', className: 'badge--red',   icon: '✕' },
};

/**
 * ResultCard
 * Displays the model's diagnosis result in a structured card.
 *
 * @param {{
 *   result: {
 *     disease:    string,
 *     confidence: number,          // 0-100
 *     isHealthy:  boolean,
 *     treatment:  string,
 *     prevention: string,
 *   }
 * }} props
 */
export default function ResultCard({ result }) {
    if (!result) return null;

    const { disease, confidence, isHealthy, treatment, prevention } = result;

    const status  = isHealthy == null ? null : STATUS_CONFIG[isHealthy ? 'healthy' : 'diseased'];
    const conf    = Math.min(100, Math.max(0, Math.round(confidence ?? 0)));

    /* Circular progress for confidence */
    const radius      = 26;
    const circumference = 2 * Math.PI * radius;
    const dash          = (conf / 100) * circumference;

    return (
        <article className="result-card" aria-label="Diagnosis result">

            {/* ── Header ─────────────────────────────── */}
            <div className="result-card__header">
                <div className="result-card__title-row">
                    <h2 className="result-card__disease">{disease ?? 'Unknown'}</h2>
                    {status && (
                        <span className={`result-badge ${status.className}`} aria-label={`Status: ${status.label}`}>
              <span className="result-badge__icon" aria-hidden="true">{status.icon}</span>
                            {status.label}
            </span>
                    )}
                </div>

                {/* Confidence ring */}
                <div className="confidence-ring" aria-label={`Confidence: ${conf}%`}>
                    <svg viewBox="0 0 64 64" className="confidence-ring__svg" aria-hidden="true">
                        {/* track */}
                        <circle cx="32" cy="32" r={radius}
                                fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                        {/* fill */}
                        <circle cx="32" cy="32" r={radius}
                                fill="none"
                                stroke="url(#conf-gradient)"
                                strokeWidth="5"
                                strokeLinecap="round"
                                strokeDasharray={`${dash} ${circumference}`}
                                transform="rotate(-90 32 32)"
                        />
                        <defs>
                            <linearGradient id="conf-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%"   stopColor="#16a34a" />
                                <stop offset="100%" stopColor="#84cc16" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div className="confidence-ring__label">
                        <span className="confidence-ring__pct">{conf}%</span>
                        <span className="confidence-ring__sub">confidence</span>
                    </div>
                </div>
            </div>

            {/* ── Divider ────────────────────────────── */}
            <hr className="result-card__divider" />

            {/* ── Body sections ──────────────────────── */}
            <div className="result-card__body">

                <section className="result-section" aria-labelledby="treatment-heading">
                    <div className="result-section__icon-wrap result-section__icon-wrap--green" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                            <path d="M8 12l3 3 5-5"/>
                        </svg>
                    </div>
                    <div className="result-section__content">
                        <h3 id="treatment-heading" className="result-section__title">Treatment</h3>
                        <p className="result-section__text">{treatment ?? 'No treatment information available.'}</p>
                    </div>
                </section>

                <section className="result-section" aria-labelledby="prevention-heading">
                    <div className="result-section__icon-wrap result-section__icon-wrap--blue" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                    </div>
                    <div className="result-section__content">
                        <h3 id="prevention-heading" className="result-section__title">Prevention</h3>
                        <p className="result-section__text">{prevention ?? 'No prevention information available.'}</p>
                    </div>
                </section>

            </div>
        </article>
    );
}
