import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard from './Dashboard.jsx';

const render = (history) => renderToStaticMarkup(<Dashboard history={history} />);

const scan = (overrides = {}) => ({
    id: 'scan',
    timestamp: '2026-04-10T06:00:00.000Z',
    disease: 'Tomato Late Blight',
    confidence: 91,
    isHealthy: false,
    ...overrides,
});
const healthyScan = (overrides = {}) =>
    scan({ disease: 'Tomato Healthy', isHealthy: true, ...overrides });

const scoreOf = (html) => html.match(/dash-score-card__value[^>]*>([^<]*)</)[1];
const statusOf = (html) => html.match(/dash-score-card__status[^>]*>([^<]*)</)[1];

describe('Dashboard health score', () => {
    it('is the share of scans that were healthy', () => {
        const html = render([healthyScan(), healthyScan(), healthyScan(), scan()]);

        expect(scoreOf(html)).toBe('75%');
        expect(statusOf(html)).toBe('Healthy');
    });

    it('is 100% when every scan is healthy', () => {
        expect(scoreOf(render([healthyScan(), healthyScan()]))).toBe('100%');
    });

    it('is 0% and Critical when no scan is healthy', () => {
        const html = render([scan(), scan()]);

        expect(scoreOf(html)).toBe('0%');
        expect(statusOf(html)).toBe('Critical');
    });

    it('shows a dash and "No data yet" when there are no scans', () => {
        const html = render([]);

        expect(scoreOf(html)).toBe('—');
        expect(statusOf(html)).toBe('No data yet');
    });

    it('still understands scans saved before this change (severity "None" meant healthy)', () => {
        const html = render([
            { disease: 'Tomato Healthy', confidence: 97, severity: 'None' },
            { disease: 'Tomato Late Blight', confidence: 93, severity: 'High' },
        ]);

        expect(scoreOf(html)).toBe('50%');
    });
});

describe('Dashboard recent scans', () => {
    it('marks healthy scans green and diseased scans red', () => {
        const html = render([scan(), healthyScan()]);

        expect(html).toMatch(/result-badge badge--green">Healthy</);
        expect(html).toMatch(/result-badge badge--red">Diseased</);
    });

    it('shows confidence rounded to a whole percent', () => {
        const html = render([scan({ confidence: 93.12339999 })]);

        expect(html).toContain('93%');
        expect(html).not.toContain('93.12');
    });

    it('never shows a severity label', () => {
        const html = render([scan(), healthyScan()]);

        expect(html).not.toMatch(/severity/i);
        expect(html).not.toMatch(/Moderate/);
    });
});
