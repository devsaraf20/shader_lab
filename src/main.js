// -----------------------------------------------------------------------------
// Entry point: wires the HTML interface to the 3D stage.
// -----------------------------------------------------------------------------
import './style.css';
import './shaders/chunks.js'; // registers our #include chunks with three.js
import { effects } from './effects/index.js';
import { GEOMETRIES, Stage } from './stage.js';
import { buildControls } from './ui/controls.js';
import { createCodeView } from './ui/codeview.js';
import { download, pickFormat, recordLoop } from './ui/recorder.js';

const $ = (sel) => document.querySelector(sel);

// ---- 1. Create the stage (renderer + scene) --------------------------------
const canvas = $('#gl');
let stage;
try {
  stage = new Stage(canvas);
} catch (err) {
  $('#viewport').innerHTML = '<p class="fatal">WebGL 2 is not available in this browser, so the shaders cannot run.</p>';
  throw err;
}

// ---- 2. Geometry switch ----------------------------------------------------
const geoBar = $('#geometry');
for (const [key, geo] of Object.entries(GEOMETRIES)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = geo.label;
  b.dataset.geo = key;
  b.setAttribute('role', 'radio');
  b.addEventListener('click', () => setGeometry(key));
  geoBar.append(b);
}
function setGeometry(key) {
  stage.setGeometry(key);
  geoBar.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.geo === key;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
}
setGeometry('sphere');

// ---- 3. Gallery --------------------------------------------------------------
const gallery = $('#gallery');
const cards = effects.map((effect, i) => {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.dataset.id = effect.id;
  card.innerHTML = `
    <span class="thumb"><img alt="" /></span>
    <span class="card-text">
      <span class="card-index">${String(i + 1).padStart(2, '0')}</span>
      <span class="card-name">${effect.name}</span>
      <span class="card-tag">${effect.tagline}</span>
    </span>`;
  card.addEventListener('click', () => selectEffect(effect));
  gallery.append(card);
  return card;
});

// ---- 4. Panel: controls + code ---------------------------------------------
const controlsEl = $('#tab-controls');
const codeView = createCodeView($('#tab-code'));
let currentEffect = null;

function selectEffect(effect) {
  currentEffect = effect;
  const runtime = stage.setEffect(effect);
  const index = effects.indexOf(effect);
  cards.forEach((c) => {
    const on = c.dataset.id === effect.id;
    c.classList.toggle('active', on);
    c.setAttribute('aria-current', on ? 'true' : 'false');
  });
  cards[index].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  $('#hud-index').textContent = `${String(index + 1).padStart(2, '0')} / ${effects.length}`;
  $('#hud-title').textContent = effect.name;
  const rebuild = () => buildControls(controlsEl, effect, runtime.uniforms, () => {
    stage.resetUniforms(effect);
    rebuild();
  });
  rebuild();
  codeView.show(effect);
  history.replaceState(null, '', `#${effect.id}`);
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
    $('#tab-controls').hidden = tab.dataset.tab !== 'controls';
    $('#tab-code').hidden = tab.dataset.tab !== 'code';
  });
});

// ---- 5. Toolbar: turntable, pause, record ------------------------------------
const spinBtn = $('#spin');
const pauseBtn = $('#pause');
const toggleSpin = () => {
  stage.setSpin(!stage.spin);
  spinBtn.setAttribute('aria-pressed', stage.spin);
};
const togglePause = () => {
  stage.paused = !stage.paused;
  pauseBtn.setAttribute('aria-pressed', stage.paused);
};
spinBtn.addEventListener('click', toggleSpin);
pauseBtn.addEventListener('click', togglePause);

const recordBtn = $('#record');
const toast = $('#toast');
let toastTimer;
function showToast(html, ms = 4000) {
  toast.innerHTML = html;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
}

let recording = false;
if (!pickFormat()) recordBtn.title = 'Recording is not supported in this browser';
recordBtn.addEventListener('click', async () => {
  if (recording) return;
  recording = true;
  recordBtn.classList.add('recording');
  const label = recordBtn.querySelector('.rec-label');
  const effect = currentEffect;
  try {
    const { blob, ext } = await recordLoop(canvas, {
      onStart: () => {
        // Rewind to the start of the loop and make sure time is running.
        stage.elapsed = 0;
        if (stage.paused) togglePause();
      },
      onProgress: (p) => {
        recordBtn.style.setProperty('--p', p);
        label.textContent = `Recording ${(p * 5).toFixed(1)}s`;
      },
    });
    download(blob, `shader-lab-${effect.id}.${ext}`);
    const mb = (blob.size / 1e6).toFixed(1);
    showToast(`Saved <strong>shader-lab-${effect.id}.${ext}</strong> · ${mb} MB${ext === 'mp4' ? ' (MP4: this browser can’t encode WebM)' : ''}`);
  } catch (err) {
    showToast(err.message || 'Recording failed', 6000);
  } finally {
    recording = false;
    recordBtn.classList.remove('recording');
    recordBtn.style.removeProperty('--p');
    label.textContent = 'Record 5s loop';
  }
});

// ---- 6. Keyboard shortcuts ---------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const i = effects.indexOf(currentEffect);
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') selectEffect(effects[(i + 1) % effects.length]);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') selectEffect(effects[(i - 1 + effects.length) % effects.length]);
  else if (e.key === ' ' && !e.target.closest('button')) togglePause();
  else if (e.key.toLowerCase() === 't') toggleSpin();
  else return;
  e.preventDefault();
});

// ---- 7. Resize: keep the drawing buffer matched to the on-screen size ------
const viewport = $('#viewport');
new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  if (width > 0 && height > 0) stage.resize(width, height);
}).observe(viewport);

// ---- 8. Start -------------------------------------------------------------
const fromHash = effects.find((e) => `#${e.id}` === location.hash);
selectEffect(fromHash || effects[0]);

// Thumbnails are rendered one per frame after start-up so the page stays responsive.
const thumbQueue = [...effects];
let lastTime = performance.now();
let frame = 0;

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  frame++;
  if (!recording && frame > 3 && thumbQueue.length) {
    const effect = thumbQueue.shift();
    const img = cards[effects.indexOf(effect)].querySelector('img');
    img.src = stage.thumbnail(effect);
    img.parentElement.classList.add('ready');
  }
  stage.update(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
