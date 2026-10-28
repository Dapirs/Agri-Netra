// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import IrrigationForm from './IrrigationForm.jsx';

let getCurrentPosition;

beforeEach(() => {
    getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition },
        configurable: true,
    });
});

afterEach(() => {
    cleanup();
    delete navigator.geolocation;
});

const submitButton = () => screen.getByRole('button', { name: 'Get irrigation recommendation' });
const choose = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillEverythingExceptLocation() {
    choose('Crop', 'Tomato');
    choose('Growth Stage', 'Mid');
    choose('Current Soil Moisture', 'Dry');
}

describe('IrrigationForm: fields', () => {
    it('no longer asks for a soil type, because the planner never used it', () => {
        render(<IrrigationForm onSubmit={() => {}} />);

        expect(screen.queryByLabelText(/^soil type$/i)).toBeNull();
    });

    it('submits crop, stage, moisture and the typed location, and nothing else', () => {
        const onSubmit = vi.fn();
        render(<IrrigationForm onSubmit={onSubmit} />);

        fillEverythingExceptLocation();
        type('Latitude', '28.6139');
        type('Longitude', '77.209');
        expect(submitButton().disabled).toBe(false);
        fireEvent.click(submitButton());

        expect(onSubmit).toHaveBeenCalledWith({
            crop: 'Tomato',
            stage: 'Mid',
            soilMoisture: 'Dry',
            lat: '28.6139',
            lon: '77.209',
        });
    });

    it('keeps submit disabled until a location is entered', () => {
        render(<IrrigationForm onSubmit={() => {}} />);

        fillEverythingExceptLocation();

        expect(submitButton().disabled).toBe(true);
    });

    it('does not submit while a request is already running', () => {
        render(<IrrigationForm onSubmit={() => {}} loading />);

        expect(screen.getByRole('button', { name: 'Getting recommendation…' }).disabled).toBe(true);
    });
});

describe('IrrigationForm: location', () => {
    it('fills the coordinates from "Use My Location"', () => {
        getCurrentPosition.mockImplementation((onSuccess) =>
            onSuccess({ coords: { latitude: 28.6139, longitude: 77.209 } })
        );
        render(<IrrigationForm onSubmit={() => {}} />);

        fireEvent.click(screen.getByRole('button', { name: 'Use My Location' }));

        expect(screen.getByLabelText('Latitude').value).toBe('28.613900');
        expect(screen.getByLabelText('Longitude').value).toBe('77.209000');
    });

    // The dead end this fixes: location used to come only from GPS, so denying
    // permission meant the form could never be submitted.
    it('can still be submitted with typed coordinates after location permission is denied', () => {
        getCurrentPosition.mockImplementation((_onSuccess, onError) =>
            onError({ message: 'User denied Geolocation' })
        );
        const onSubmit = vi.fn();
        render(<IrrigationForm onSubmit={onSubmit} />);

        fireEvent.click(screen.getByRole('button', { name: 'Use My Location' }));
        expect(screen.getByText(/Unable to get location/)).toBeTruthy();

        fillEverythingExceptLocation();
        type('Latitude', '12.97');
        type('Longitude', '77.59');
        fireEvent.click(submitButton());

        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});

describe('IrrigationForm: coordinate validation', () => {
    it.each([
        ['91', '77'],
        ['-91', '77'],
        ['abc', '77'],
        ['12', '181'],
        ['12', '-181'],
        ['12', 'east'],
        ['  ', '77'],
    ])('keeps submit disabled for latitude %p and longitude %p', (lat, lon) => {
        render(<IrrigationForm onSubmit={() => {}} />);

        fillEverythingExceptLocation();
        type('Latitude', lat);
        type('Longitude', lon);

        expect(submitButton().disabled).toBe(true);
    });

    it.each([
        ['90', '180'],
        ['-90', '-180'],
        ['0', '0'], // the equator and prime meridian are real places, not "empty"
    ])('accepts the boundary latitude %p and longitude %p', (lat, lon) => {
        render(<IrrigationForm onSubmit={() => {}} />);

        fillEverythingExceptLocation();
        type('Latitude', lat);
        type('Longitude', lon);

        expect(submitButton().disabled).toBe(false);
    });

    it('explains what is wrong with an out-of-range latitude', () => {
        render(<IrrigationForm onSubmit={() => {}} />);

        type('Latitude', '95');

        expect(screen.getByRole('alert').textContent).toMatch(/latitude between -90 and 90/i);
    });

    it('explains what is wrong with an out-of-range longitude', () => {
        render(<IrrigationForm onSubmit={() => {}} />);

        type('Longitude', '200');

        expect(screen.getByRole('alert').textContent).toMatch(/longitude between -180 and 180/i);
    });
});
