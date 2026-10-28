// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import Scanner from './Scanner.jsx';

// The model and image preprocessing load TensorFlow.js, which these tests don't need.
vi.mock('../hooks/useModel', () => ({
    default: () => ({ model: null, loading: false, error: null }),
}));
vi.mock('../utils/preprocessImage', () => ({ default: vi.fn() }));

/** A fake camera stream whose tracks record whether they were stopped. */
function fakeStream() {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    return { getTracks: () => tracks, tracks };
}
const allStopped = (stream) => stream.tracks.every((track) => track.stop.mock.calls.length === 1);
const noneStopped = (stream) => stream.tracks.every((track) => track.stop.mock.calls.length === 0);

/** A promise we resolve by hand, to model the browser's camera permission prompt. */
function deferred() {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
}

let getUserMedia;

beforeEach(() => {
    getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
    cleanup();
    delete navigator.mediaDevices;
    vi.restoreAllMocks();
});

const clickUseCamera = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Capture image with camera' }));
const cameraWindow = () => screen.findByRole('button', { name: 'Cancel' });

describe('Scanner camera', () => {
    it('stops the camera when the user leaves the page while it is open', async () => {
        const stream = fakeStream();
        getUserMedia.mockResolvedValue(stream);
        const { unmount } = render(<Scanner onResult={() => {}} />);

        clickUseCamera();
        await cameraWindow();
        expect(noneStopped(stream)).toBe(true);

        unmount();

        expect(allStopped(stream)).toBe(true);
    });

    it('stops a camera stream that arrives after the user already left', async () => {
        const stream = fakeStream();
        const permission = deferred();
        getUserMedia.mockReturnValue(permission.promise);
        const { unmount } = render(<Scanner onResult={() => {}} />);

        clickUseCamera();
        unmount(); // the user switched tabs while the permission prompt was still open

        await act(async () => {
            permission.resolve(stream);
            await permission.promise;
        });

        expect(allStopped(stream)).toBe(true);
    });

    it('does not leave the first stream running when the camera is opened twice', async () => {
        const first = fakeStream();
        const second = fakeStream();
        getUserMedia.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
        const { unmount } = render(<Scanner onResult={() => {}} />);

        clickUseCamera();
        await cameraWindow();
        clickUseCamera(); // "Use Camera" stays on screen while the camera window is open
        await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
        await act(async () => {});

        expect(allStopped(first)).toBe(true);
        expect(noneStopped(second)).toBe(true);

        unmount();
        expect(allStopped(second)).toBe(true);
    });

    it('releases the camera when the camera window is closed', async () => {
        const stream = fakeStream();
        getUserMedia.mockResolvedValue(stream);
        render(<Scanner onResult={() => {}} />);

        clickUseCamera();
        fireEvent.click(await cameraWindow());

        expect(allStopped(stream)).toBe(true);
    });

    // main.jsx wraps the app in StrictMode, which runs every effect twice in development.
    it('still opens and releases the camera under React StrictMode', async () => {
        const stream = fakeStream();
        getUserMedia.mockResolvedValue(stream);
        const { unmount } = render(
            <StrictMode>
                <Scanner onResult={() => {}} />
            </StrictMode>
        );

        clickUseCamera();
        await cameraWindow();
        expect(noneStopped(stream)).toBe(true);

        unmount();
        expect(allStopped(stream)).toBe(true);
    });
});
