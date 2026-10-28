import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ResultCard from './ResultCard.jsx';

const render = (result) => renderToStaticMarkup(<ResultCard result={result} />);

const diseased = {
    disease: 'Tomato Late Blight',
    confidence: 93.4,
    isHealthy: false,
    treatment: 'Remove infected leaves.',
    prevention: 'Rotate crops.',
};
const healthy = { ...diseased, disease: 'Tomato Healthy', isHealthy: true };

describe('ResultCard', () => {
    it('shows a Healthy status for a healthy leaf', () => {
        expect(render(healthy)).toContain('aria-label="Status: Healthy"');
    });

    it('shows a Diseased status for a diseased leaf', () => {
        expect(render(diseased)).toContain('aria-label="Status: Diseased"');
    });

    it('never shows a severity, because model confidence is not disease severity', () => {
        for (const result of [healthy, diseased]) {
            const html = render(result);
            expect(html).not.toMatch(/severity/i);
            expect(html).not.toMatch(/Moderate/);
        }
    });

    it('shows the model confidence as a rounded percentage', () => {
        expect(render(diseased)).toContain('93%');
    });

    it('shows no status badge when it does not know whether the leaf is healthy', () => {
        const { isHealthy: _unused, ...unknown } = diseased;
        expect(render(unknown)).not.toContain('Status:');
    });

    it('shows the disease name, treatment and prevention', () => {
        const html = render(diseased);
        expect(html).toContain('Tomato Late Blight');
        expect(html).toContain('Remove infected leaves.');
        expect(html).toContain('Rotate crops.');
    });

    it('renders nothing without a result', () => {
        expect(render(null)).toBe('');
    });
});
