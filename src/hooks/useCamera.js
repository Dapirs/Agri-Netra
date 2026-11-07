import { useState, useRef, useCallback, useEffect } from 'react';

/** The largest image the upload box accepts (the box says "max 10 MB"). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * useCamera
 * ─────────
 * Holds the image the user picked (by upload, drag-and-drop or camera capture).
 * Images over MAX_IMAGE_BYTES are rejected with a message in `error`.
 *
 * @returns {{
 *   preview:          string | null,    // object URL to show in an <img>
 *   file:             File | null,      // the chosen image itself
 *   error:            string | null,    // why the last image was rejected, if it was
 *   handleFileUpload: (e: { target: { files: File[], value: string } }) => void,
 * }}
 */
function useCamera() {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const urlRef = useRef(null);

  /** Frees the memory held by the current preview URL. */
  const releasePreview = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  // Free the current preview when the user leaves the page.
  useEffect(() => releasePreview, [releasePreview]);

  const handleFileUpload = useCallback(
    (e) => {
      const selected = e.target.files?.[0];
      if (!selected) return;

      // Reset the input so the same file can be selected again later
      e.target.value = '';

      if (selected.size > MAX_IMAGE_BYTES) {
        const megabytes = (selected.size / (1024 * 1024)).toFixed(1);
        setError(`That image is ${megabytes} MB. The maximum is 10 MB.`);
        return;
      }

      releasePreview();
      urlRef.current = URL.createObjectURL(selected);
      setPreview(urlRef.current);
      setFile(selected);
      setError(null);
    },
    [releasePreview]
  );

  return { preview, file, error, handleFileUpload };
}

export default useCamera;
