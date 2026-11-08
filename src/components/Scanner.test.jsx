// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import Scanner from './Scanner.jsx';
import { TREATMENT_DB } from '../data/treatmentDB';

// The model and image preprocessing load TensorFlow.js, which these tests don't need.
// Tests that scan an image put a fake model in `mocks.model`.
const mocks = vi.hoisted(() => ({ model: null, preprocessImage: vi.fn() }));
vi.mock('../hooks/useModel', () => ({
  default: () => ({ model: mocks.model, loading: false, error: null }),
}));
vi.mock('../utils/preprocessImage', () => ({ default: mocks.preprocessImage }));

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
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let getUserMedia;

let urlCount;

beforeEach(() => {
  mocks.model = null;
  mocks.preprocessImage.mockReset();
  urlCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++urlCount}`);
  URL.revokeObjectURL = vi.fn();
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
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

/** Pretends the user switched to another browser tab (or back), like the browser does. */
function setPageHidden(hidden) {
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('Scanner camera in a background tab', () => {
  // Remove the pretend value so document.visibilityState is the real one again.
  afterEach(() => {
    delete document.visibilityState;
  });

  it('stops the camera and closes the camera window when the user switches tabs', async () => {
    const stream = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    render(<Scanner onResult={() => {}} />);

    clickUseCamera();
    await cameraWindow();
    expect(noneStopped(stream)).toBe(true);

    act(() => setPageHidden(true));

    expect(allStopped(stream)).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('stops a camera stream that arrives while the tab is in the background', async () => {
    const stream = fakeStream();
    const permission = deferred();
    getUserMedia.mockReturnValue(permission.promise);
    render(<Scanner onResult={() => {}} />);

    clickUseCamera();
    act(() => setPageHidden(true)); // the user switched tabs while the permission prompt was open

    await act(async () => {
      permission.resolve(stream);
      await permission.promise;
    });

    expect(allStopped(stream)).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('lets the user open the camera again after coming back to the tab', async () => {
    const first = fakeStream();
    const second = fakeStream();
    getUserMedia.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    render(<Scanner onResult={() => {}} />);

    clickUseCamera();
    await cameraWindow();
    act(() => setPageHidden(true));
    act(() => setPageHidden(false));

    clickUseCamera();
    await cameraWindow();

    expect(noneStopped(second)).toBe(true);
  });

  it('stops listening for tab switches once the user leaves the page', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<Scanner onResult={() => {}} />);

    unmount();

    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('Scanner camera preview', () => {
  it('does not mirror the live preview, because the captured photo is not mirrored', async () => {
    getUserMedia.mockResolvedValue(fakeStream());
    const { container } = render(<Scanner onResult={() => {}} />);

    clickUseCamera();
    await cameraWindow();

    expect(container.querySelector('video').style.transform).not.toContain('scaleX');
  });

  it('shows the live stream in the preview as soon as the camera window opens', async () => {
    const stream = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const { container } = render(<Scanner onResult={() => {}} />);

    clickUseCamera();
    await cameraWindow();

    expect(container.querySelector('video').srcObject).toBe(stream);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('switches the preview to the newer stream when the camera is opened twice', async () => {
    const first = fakeStream();
    const second = fakeStream();
    getUserMedia.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { container } = render(<Scanner onResult={() => {}} />);

    clickUseCamera();
    await cameraWindow();
    clickUseCamera();
    await waitFor(() => expect(container.querySelector('video').srcObject).toBe(second));
  });
});

const MB = 1024 * 1024;

/** A File that claims to be `bytes` long, without allocating that much memory. */
function imageOf(bytes, name = 'leaf.jpg') {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}
const fileInput = (container) => container.querySelector('input[type="file"]');
const choose = (container, file) =>
  fireEvent.change(fileInput(container), { target: { files: [file] } });
const shownPreview = () => screen.queryByAltText('Selected crop');

describe('Scanner image size limit', () => {
  it('rejects an image over 10 MB and keeps the previous photo', () => {
    const { container } = render(<Scanner onResult={() => {}} />);
    choose(container, imageOf(2 * MB, 'small.jpg'));
    expect(shownPreview()).not.toBeNull();

    choose(container, imageOf(10 * MB + 1, 'huge.jpg'));

    expect(screen.getByRole('alert').textContent).toMatch(/maximum is 10 MB/);
    expect(shownPreview().getAttribute('src')).toBe('blob:preview-1');
  });

  it('accepts an image of exactly 10 MB', () => {
    const { container } = render(<Scanner onResult={() => {}} />);

    choose(container, imageOf(10 * MB));

    expect(shownPreview()).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects a too-big image that is dragged onto the upload box', () => {
    render(<Scanner onResult={() => {}} />);

    fireEvent.drop(screen.getByRole('button', { name: 'Upload or drag an image' }), {
      dataTransfer: { files: [imageOf(11 * MB)] },
    });

    expect(shownPreview()).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/maximum is 10 MB/);
  });

  it('clears the size message once a good image is chosen', () => {
    const { container } = render(<Scanner onResult={() => {}} />);
    choose(container, imageOf(11 * MB));
    expect(screen.getByRole('alert')).not.toBeNull();

    choose(container, imageOf(1 * MB));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(shownPreview()).not.toBeNull();
  });
});

describe('Scanner preview memory', () => {
  it('releases the previous preview when a new image replaces it', () => {
    const { container } = render(<Scanner onResult={() => {}} />);

    choose(container, imageOf(MB, 'a.jpg'));
    choose(container, imageOf(MB, 'b.jpg'));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:preview-2');
  });

  it('releases the preview when the user leaves the page', () => {
    const { container, unmount } = render(<Scanner onResult={() => {}} />);
    choose(container, imageOf(MB));

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('keeps the shown preview when a too-big image is rejected', () => {
    const { container } = render(<Scanner onResult={() => {}} />);
    choose(container, imageOf(MB));

    choose(container, imageOf(11 * MB));

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});

/** A fake model that answers every image with the given probabilities. */
function fakeModel(scores) {
  const predictions = {
    data: vi.fn().mockResolvedValue(Float32Array.from(scores)),
    dispose: vi.fn(),
  };
  return { predict: vi.fn().mockReturnValue(predictions) };
}
const TOMATO_HEALTHY = 37; // position of Tomato___healthy in the model's class list
const peaked = (index, confidence, n = 38) =>
  Array.from({ length: n }, (_, i) => (i === index ? confidence : (1 - confidence) / (n - 1)));
const clickScan = () => fireEvent.click(screen.getByRole('button', { name: 'Scan crop' }));

describe('Scanner scanning', () => {
  beforeEach(() => {
    mocks.preprocessImage.mockResolvedValue({ dispose: vi.fn() });
  });

  it('scans the chosen file itself, without downloading it back from its preview URL', async () => {
    mocks.model = fakeModel(peaked(TOMATO_HEALTHY, 0.97));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const onResult = vi.fn();
    const { container } = render(<Scanner onResult={onResult} />);
    const file = imageOf(MB, 'my-leaf.jpg');

    choose(container, file);
    clickScan();
    await waitFor(() => expect(onResult).toHaveBeenCalled());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.preprocessImage.mock.calls[0][0]).toBe(file);
    vi.unstubAllGlobals();
  });

  it('reports a confident result with its confidence as a percentage', async () => {
    mocks.model = fakeModel(peaked(TOMATO_HEALTHY, 0.97));
    const onResult = vi.fn();
    const { container } = render(<Scanner onResult={onResult} />);

    choose(container, imageOf(MB));
    clickScan();
    await waitFor(() => expect(onResult).toHaveBeenCalled());

    const result = onResult.mock.calls[0][0];
    expect(result.isHealthy).toBe(true);
    expect(result.confidence).toBeCloseTo(97, 1);
  });

  it('passes the treatment and prevention steps on as separate steps, not one paragraph', async () => {
    mocks.model = fakeModel(peaked(TOMATO_HEALTHY, 0.97));
    const onResult = vi.fn();
    const { container } = render(<Scanner onResult={onResult} />);

    choose(container, imageOf(MB));
    clickScan();
    await waitFor(() => expect(onResult).toHaveBeenCalled());

    const result = onResult.mock.calls[0][0];
    expect(result.treatment).toEqual(TREATMENT_DB.Tomato___healthy.treatment);
    expect(result.prevention).toEqual(TREATMENT_DB.Tomato___healthy.prevention);
  });

  it('asks for a clearer photo when the model is not at least 85% sure', async () => {
    mocks.model = fakeModel(peaked(TOMATO_HEALTHY, 0.5));
    const onResult = vi.fn();
    const { container } = render(<Scanner onResult={onResult} />);

    choose(container, imageOf(MB));
    clickScan();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));

    expect(screen.getByRole('alert').textContent).toMatch(/clear photo of a plant leaf/);
  });

  it('shows the error when the image cannot be processed', async () => {
    mocks.model = fakeModel(peaked(TOMATO_HEALTHY, 0.97));
    mocks.preprocessImage.mockRejectedValue(new Error('This image is corrupt'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<Scanner onResult={() => {}} />);

    choose(container, imageOf(MB));
    clickScan();

    expect((await screen.findByRole('alert')).textContent).toMatch(/This image is corrupt/);
  });

  it('does not print the model scores to the console', async () => {
    mocks.model = fakeModel(peaked(TOMATO_HEALTHY, 0.97));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onResult = vi.fn();
    const { container } = render(<Scanner onResult={onResult} />);

    choose(container, imageOf(MB));
    clickScan();
    await waitFor(() => expect(onResult).toHaveBeenCalled());

    expect(log).not.toHaveBeenCalled();
  });
});
