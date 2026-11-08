/** Steps (an array) as bullet points; plain text, such as fallback advice, as a paragraph. */
export function Advice({ value, fallback }) {
  if (Array.isArray(value)) {
    return (
      <ul className="result-section__list">
        {value.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    );
  }
  return <p className="result-section__text">{value ?? fallback}</p>;
}

/** Shown with a diseased result: the model can be wrong, so confirm before spraying. */
export function SafetyNote() {
  return (
    <p className="result-card__safety">
      This is an automatic diagnosis and can be wrong. Before buying or spraying any chemical,
      confirm with your local Krishi Vigyan Kendra or agriculture officer.
    </p>
  );
}
