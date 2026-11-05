// -----------------------------------------------------------------------------
// Procedural textures, generated in JavaScript at start-up so the project ships
// with zero image files. Each one draws pixels into a <canvas> and hands the
// canvas to three.js as a texture.
// -----------------------------------------------------------------------------
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace } from 'three';

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

// ---------------------------------------------------------------------------
// MATCAPS: "material captures". A matcap is a picture of a lit sphere. The
// shader looks up the pixel whose sphere-normal matches the surface normal,
// so the whole lighting setup is baked into one image. We "bake" ours by
// shading a virtual sphere pixel-by-pixel, like a tiny offline renderer.
// ---------------------------------------------------------------------------
const MATCAP_PRESETS = {
  Clay: { base: [0.78, 0.52, 0.42], spec: 0.25, shininess: 12, rim: [0.95, 0.75, 0.6], rimAmt: 0.35, key: [1, 0.96, 0.9] },
  Jade: { base: [0.15, 0.55, 0.38], spec: 0.8, shininess: 60, rim: [0.6, 1.0, 0.8], rimAmt: 0.6, key: [0.9, 1, 0.95] },
  Chrome: { base: [0.08, 0.08, 0.1], spec: 1.4, shininess: 120, rim: [0.9, 0.95, 1.0], rimAmt: 1.0, key: [1, 1, 1], horizon: true },
  Pearl: { base: [0.86, 0.84, 0.9], spec: 0.6, shininess: 30, rim: [0.75, 0.85, 1.0], rimAmt: 0.7, key: [1, 0.92, 0.95], sheen: true },
  Gold: { base: [0.55, 0.36, 0.08], spec: 1.2, shininess: 40, rim: [1.0, 0.85, 0.45], rimAmt: 0.8, key: [1, 0.9, 0.7], horizon: true },
};

function bakeMatcap(preset, size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const key = normalize([-0.45, 0.6, 0.66]); // main light, top-left-front
  const fill = normalize([0.7, -0.2, 0.5]); // weak light, right
  const view = [0, 0, 1];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = 1 - (y + 0.5) / size * 2;
      const r2 = nx * nx + ny * ny;
      const i = (y * size + x) * 4;
      if (r2 > 1) { img.data[i + 3] = 255; continue; }
      const n = [nx, ny, Math.sqrt(1 - r2)]; // normal of the sphere at this pixel
      const diff = Math.max(dot(n, key), 0) * 0.85 + Math.max(dot(n, fill), 0) * 0.25 + 0.18;
      const h = normalize(add(key, view));
      const spec = Math.pow(Math.max(dot(n, h), 0), preset.shininess) * preset.spec;
      const rim = Math.pow(1 - n[2], 3) * preset.rimAmt;
      let col = preset.base.map((c, k) => c * diff + spec * preset.key[k] + rim * preset.rim[k]);
      if (preset.horizon) {
        // reflective presets fake a sky above and dark ground below
        const refl = n[1];
        const env = refl > -0.05 ? 0.35 + 0.5 * refl : 0.04;
        col = col.map((c) => c + env * 0.6);
      }
      if (preset.sheen) {
        const s = 0.5 + 0.5 * Math.sin(n[0] * 6 + n[1] * 4);
        col = [col[0] + rim * s * 0.3, col[1] + rim * 0.15, col[2] + rim * (1 - s) * 0.35];
      }
      img.data[i] = to8(col[0]);
      img.data[i + 1] = to8(col[1]);
      img.data[i + 2] = to8(col[2]);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace; // the picture is in sRGB, like any image file
  return tex;
}

let matcapCache = null;
export function getMatcaps() {
  if (!matcapCache) {
    matcapCache = Object.entries(MATCAP_PRESETS).map(([label, preset]) => ({
      label,
      value: bakeMatcap(preset),
    }));
  }
  return matcapCache;
}

// ---------------------------------------------------------------------------
// Tileable detail texture for the triplanar terrain. Value noise whose lattice
// wraps around, so the left edge matches the right edge and it repeats cleanly.
// R channel = rocky grain, G channel = softer blotches for grass.
// ---------------------------------------------------------------------------
let detailCache = null;
export function getDetailTexture(size = 256) {
  if (detailCache) return detailCache;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rand = mulberry32(7);
  const lattice = Array.from({ length: 64 * 64 }, () => rand());
  const valueNoise = (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = (i, j) => lattice[((j % period + period) % period) * 64 + ((i % period + period) % period)];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rock = 0, amp = 0.5;
      for (let o = 0, period = 4; o < 5; o++, period *= 2) {
        rock += amp * valueNoise((x / size) * period, (y / size) * period, period);
        amp *= 0.5;
      }
      const streak = valueNoise((x / size) * 4, (y / size) * 32, 32) * 0.35; // layered strata
      const grass = valueNoise((x / size) * 8, (y / size) * 8, 8) * 0.6 + valueNoise((x / size) * 32, (y / size) * 32, 32) * 0.4;
      const i = (y * size + x) * 4;
      img.data[i] = to8(rock * 0.75 + streak);
      img.data[i + 1] = to8(grass);
      img.data[i + 2] = 0;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = NoColorSpace; // data, not colour: don't convert it
  detailCache = tex;
  return tex;
}

// ---- tiny vector helpers ----
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function normalize(a) { const l = Math.hypot(...a); return a.map((v) => v / l); }
function to8(v) { return Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(v, 0), 1 / 1.6) * 255))); }
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
