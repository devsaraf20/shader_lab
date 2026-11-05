import { BackSide, Color, DoubleSide } from 'three';
import { surfaceVertex } from './common.js';

// ---- Pass 1: the outline ("inverted hull") ----
const outlineVertex = /* glsl */ `
#include <sl_common>

uniform float uOutlineWidth;   // in screen pixels

void main() {
  // 1. Project the vertex to the screen as normal.
  vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

  // 2. Find which way the normal points on screen.
  vec3 viewNormal = normalize(normalMatrix * normal);
  vec2 screenDir = (projectionMatrix * vec4(viewNormal, 0.0)).xy;
  screenDir /= max(length(screenDir), 1e-4);

  // 3. Push the vertex outward by a fixed number of pixels. Multiplying by w
  //    undoes the perspective divide, so the width is constant at any distance.
  clipPos.xy += screenDir * uOutlineWidth * uPixelRatio * 2.0 / uResolution * clipPos.w;
  gl_Position = clipPos;
}
`;

const outlineFragment = /* glsl */ `
uniform vec3 uOutlineColor;
void main() {
  // The fattened copy only shows its back faces, so all you see is a rim
  // peeking out around the real object: the outline.
  gl_FragColor = vec4(uOutlineColor, 1.0);
  #include <colorspace_fragment>
}
`;

// ---- Pass 2: the cel-shaded surface ----
const toonFragment = /* glsl */ `
#include <sl_common>

uniform vec3  uBaseColor;
uniform vec3  uShadowColor;
uniform vec3  uRimColor;
uniform float uBands;       // number of light steps
uniform float uSpecSize;    // size of the hard highlight
uniform float uRimAmount;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 L = normalize(vec3(-0.5, 0.8, 0.6));
  vec3 V = normalize(cameraPosition - vWorldPos);

  // 1. Ordinary smooth light amount, 0..1.
  float ndl = max(dot(N, L), 0.0);

  // 2. Quantise it into flat steps. fwidth() measures how fast the value
  //    changes per pixel, so the step edges are anti-aliased instead of jaggy.
  float x = ndl * uBands;
  float aa = fwidth(x);
  float stepped = (floor(x) + smoothstep(1.0 - aa, 1.0, fract(x))) / uBands;
  vec3 col = mix(uShadowColor, uBaseColor, stepped);

  // 3. Hard-edged specular highlight.
  float ndh = dot(N, normalize(L + V));
  float specEdge = 1.0 - uSpecSize;
  float spec = smoothstep(specEdge - fwidth(ndh), specEdge, ndh);
  col = mix(col, vec3(1.0), spec * 0.9);

  // 4. Anime-style rim light, only on the lit side.
  float rim = 1.0 - max(dot(N, V), 0.0);
  float rimMask = smoothstep(0.62, 0.64, rim * pow(ndl, 0.15));
  col = mix(col, uRimColor, rimMask * uRimAmount);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'toon',
  name: 'Toon',
  tagline: 'Stepped lighting with an inverted-hull outline',
  steps: [
    'The outline is a second copy of the mesh, pushed outward and drawn back-faces only.',
    'Lighting (N·L) is floored into a few flat bands.',
    'A hard specular dot and a rim light finish the cel look.',
  ],
  uniforms: () => ({
    uBaseColor: { value: new Color('#ff8a5c') },
    uShadowColor: { value: new Color('#4a2c6b') },
    uRimColor: { value: new Color('#fff1c1') },
    uOutlineColor: { value: new Color('#0d0b14') },
    uBands: { value: 3 },
    uSpecSize: { value: 0.03 },
    uRimAmount: { value: 0.7 },
    uOutlineWidth: { value: 4.0 },
  }),
  controls: [
    { uniform: 'uBaseColor', type: 'color', label: 'Lit colour' },
    { uniform: 'uShadowColor', type: 'color', label: 'Shadow colour' },
    { uniform: 'uBands', type: 'range', label: 'Light bands', min: 1, max: 8, step: 1 },
    { uniform: 'uSpecSize', type: 'range', label: 'Highlight size', min: 0, max: 0.2, step: 0.005 },
    { uniform: 'uRimAmount', type: 'range', label: 'Rim light', min: 0, max: 1, step: 0.01 },
    { uniform: 'uRimColor', type: 'color', label: 'Rim colour' },
    { uniform: 'uOutlineWidth', type: 'range', label: 'Outline width (px)', min: 0, max: 12, step: 0.5 },
    { uniform: 'uOutlineColor', type: 'color', label: 'Outline colour' },
  ],
  layers: [
    { name: 'Outline', vertexShader: outlineVertex, fragmentShader: outlineFragment, options: { side: BackSide } },
    { name: 'Surface', vertexShader: surfaceVertex, fragmentShader: toonFragment, options: { side: DoubleSide } },
  ],
};
