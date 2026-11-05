// Records the WebGL canvas for exactly one loop and downloads it as a video.
// canvas.captureStream() turns the canvas into a live video track, and
// MediaRecorder encodes that track into WebM in the browser. No server needed.
import { LOOP_SECONDS } from '../shaders/chunks.js';

const CANDIDATES = [
  ['video/webm;codecs=vp9', 'webm'],
  ['video/webm;codecs=vp8', 'webm'],
  ['video/webm', 'webm'],
  ['video/mp4;codecs=avc1', 'mp4'], // Safari can't make WebM; MP4 is the fallback
  ['video/mp4', 'mp4'],
];

export function pickFormat() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

/**
 * Records `canvas` for one loop.
 * onStart() is called right before recording begins (use it to rewind time),
 * onProgress(0..1) while recording. Resolves with { blob, ext }.
 */
export function recordLoop(canvas, { fps = 60, onStart, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const format = pickFormat();
    if (!format || !canvas.captureStream) {
      reject(new Error('This browser cannot record canvas video. Try Chrome, Edge or Firefox.'));
      return;
    }
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onerror = (e) => reject(e.error || new Error('Recording failed'));
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve({ blob: new Blob(chunks, { type: format.mime }), ext: format.ext });
    };

    onStart?.();
    recorder.start();
    const start = performance.now();
    const tick = () => {
      const p = Math.min((performance.now() - start) / (LOOP_SECONDS * 1000), 1);
      onProgress?.(p);
      if (p < 1) requestAnimationFrame(tick);
      else recorder.stop();
    };
    requestAnimationFrame(tick);
  });
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
