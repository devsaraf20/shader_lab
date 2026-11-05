import { Color } from 'three';
import { postVertex, postProps, showcaseLayer, showcaseUniforms } from './post-common.js';

const fragmentShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform sampler2D tScene;     // the finished 3D render, as a texture
uniform float uStrength;      // how far pixels get pushed (in screen fractions)
uniform float uScale;         // size of the shimmer cells
uniform float uSpeed;         // rising speed (whole cycles per loop)
uniform float uRise;          // how high above the bottom the heat reaches
uniform float uAberration;    // colour fringing
uniform float uShowMask;
uniform vec3  uHeatTint;

varying vec2 vUv;

// Two noise values = a 2D push direction.
vec2 noise2(vec2 p) {
  return vec2(snoise(vec3(p, 0.0)), snoise(vec3(p + 19.7, 7.3)));
}

void main() {
  // 1. Heat mask: strongest at the bottom of the frame, fading upward.
  float mask = smoothstep(uRise, 0.0, vUv.y);
  mask *= mask;

  // 2. Rising noise that loops seamlessly. Two copies scroll upward half a
  //    cycle apart; each fades out just before it jumps back (a "flow map" trick).
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y) * uScale;
  float t = uPhase * uSpeed;
  float phaseA = fract(t);
  float phaseB = fract(t + 0.5);
  vec2 nA = noise2(p - vec2(0.0, phaseA * 1.5));
  vec2 nB = noise2(p - vec2(0.0, phaseB * 1.5) + 31.0);
  float blend = abs(phaseA * 2.0 - 1.0);   // 1 when A is about to jump, so hide A
  vec2 n = mix(nA, nB, blend);

  // 3. Offset the lookup position. Heat mostly wobbles sideways.
  vec2 offset = n * vec2(1.0, 0.6) * uStrength * mask;

  // 4. Chromatic aberration: sample red, green and blue at slightly different spots.
  vec3 col;
  col.r = texture2D(tScene, vUv + offset * (1.0 + uAberration)).r;
  col.g = texture2D(tScene, vUv + offset).g;
  col.b = texture2D(tScene, vUv + offset * (1.0 - uAberration)).b;

  // 5. A faint warm glow where it's hottest.
  col += uHeatTint * mask * 0.08;

  if (uShowMask > 0.5) col = mix(col, vec3(mask, n * 0.5 + 0.5) * mask, 0.85);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'heathaze',
  name: 'Heat Haze',
  tagline: 'Post-process UV distortion with rising noise',
  kind: 'post',
  steps: [
    'The 3D scene is rendered into a texture instead of the screen.',
    'A full-screen shader reads that texture with slightly shifted coordinates.',
    'The shift comes from rising noise, masked to the bottom of the frame.',
    'Red, green and blue shift by different amounts for a lens-like fringe.',
  ],
  uniforms: () => ({
    ...showcaseUniforms(),
    tScene: { value: null },
    uStrength: { value: 0.012 },
    uScale: { value: 7 },
    uSpeed: { value: 3 },
    uRise: { value: 0.85 },
    uAberration: { value: 0.35 },
    uShowMask: { value: 0 },
    uHeatTint: { value: new Color('#ff7b3a') },
  }),
  controls: [
    { uniform: 'uStrength', type: 'range', label: 'Distortion', min: 0, max: 0.05, step: 0.0005 },
    { uniform: 'uScale', type: 'range', label: 'Shimmer scale', min: 1, max: 20, step: 0.5 },
    { uniform: 'uSpeed', type: 'range', label: 'Rise speed (cycles/loop)', min: 0, max: 8, step: 1 },
    { uniform: 'uRise', type: 'range', label: 'Heat height', min: 0.1, max: 1.5, step: 0.01 },
    { uniform: 'uAberration', type: 'range', label: 'Chromatic fringe', min: 0, max: 1, step: 0.01 },
    { uniform: 'uHeatTint', type: 'color', label: 'Heat tint' },
    { uniform: 'uShowMask', type: 'toggle', label: 'Show mask + noise' },
    { uniform: 'uColorA', type: 'color', label: 'Object colour A' },
    { uniform: 'uColorB', type: 'color', label: 'Object colour B' },
  ],
  layers: [showcaseLayer],
  post: { name: 'Post-process', vertexShader: postVertex, fragmentShader },
  props: postProps,
};
