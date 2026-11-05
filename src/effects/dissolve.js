import { Color, DoubleSide } from 'three';
import { surfaceVertex } from './common.js';

const fragmentShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform float uProgress;    // 0 = solid, 1 = fully burnt away
uniform float uAuto;        // 1 = animate progress automatically
uniform float uNoiseScale;  // size of the burn blotches
uniform float uSweep;       // 0 = random holes, 1 = burns bottom-to-top
uniform float uEdgeWidth;   // thickness of the glowing rim
uniform float uGlow;        // brightness of the rim
uniform vec3  uEdgeColor;
uniform vec3  uBaseColor;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;

void main() {
  // 1. How far along is the dissolve? Auto mode eases in and out once per loop.
  float progress = uAuto > 0.5 ? 0.82 * (0.5 - 0.5 * cos(uPhase * TAU)) : uProgress;

  // 2. A noise value for this point. Object space, so the pattern sticks to the mesh.
  float n = clamp(fbm(vObjPos * uNoiseScale, 4) * 1.1 + 0.5, 0.0, 1.0);

  // 3. Optionally blend in height so the burn travels upward.
  float height = clamp(vObjPos.y * 0.5 + 0.5, 0.0, 1.0);
  float field = mix(n, height * 0.85 + n * 0.15, uSweep);

  // 4. The threshold slides past every field value as progress goes 0 -> 1.
  float threshold = mix(-uEdgeWidth, 1.0 + uEdgeWidth, progress);
  float d = field - threshold;           // < 0 means "already burnt"
  if (d < 0.0) discard;                  // throw this pixel away: a hole!

  // 5. Pixels just above the threshold form the glowing edge.
  float edge = 1.0 - smoothstep(0.0, uEdgeWidth, d);

  // 6. Basic lighting for the intact surface (diffuse + specular).
  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N;           // we can see inside through the holes
  vec3 L = normalize(vec3(0.6, 0.8, 0.5));
  vec3 V = normalize(cameraPosition - vWorldPos);
  float diff = max(dot(N, L), 0.0) * 0.8 + 0.2;
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 48.0) * 0.35;
  vec3 col = uBaseColor * diff + spec;
  if (!gl_FrontFacing) col *= 0.35;      // interior is darker

  // 7. Scorch: darken a band just behind the glowing rim.
  col *= mix(0.25, 1.0, smoothstep(uEdgeWidth, uEdgeWidth * 4.0, d));

  // 8. Emissive rim: hot white core fading to the edge colour.
  vec3 hot = mix(uEdgeColor, vec3(1.0, 0.95, 0.8), edge * edge);
  col = mix(col, hot * uGlow, edge);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'dissolve',
  name: 'Dissolve',
  tagline: 'Noise threshold with a glowing burn edge',
  steps: [
    'Sample fractal noise at every point of the object.',
    'Compare it with a moving threshold; below it, `discard` the pixel.',
    'Pixels just above the threshold become the glowing edge.',
  ],
  uniforms: () => ({
    uProgress: { value: 0.45 },
    uAuto: { value: 1 },
    uNoiseScale: { value: 2.2 },
    uSweep: { value: 0.0 },
    uEdgeWidth: { value: 0.06 },
    uGlow: { value: 2.5 },
    uEdgeColor: { value: new Color('#ff6a00') },
    uBaseColor: { value: new Color('#c3c8d4') },
  }),
  controls: [
    { uniform: 'uAuto', type: 'toggle', label: 'Animate' },
    { uniform: 'uProgress', type: 'range', label: 'Progress', min: 0, max: 1, step: 0.01 },
    { uniform: 'uNoiseScale', type: 'range', label: 'Noise scale', min: 0.5, max: 8, step: 0.1 },
    { uniform: 'uSweep', type: 'range', label: 'Upward sweep', min: 0, max: 1, step: 0.01 },
    { uniform: 'uEdgeWidth', type: 'range', label: 'Edge width', min: 0.005, max: 0.25, step: 0.005 },
    { uniform: 'uGlow', type: 'range', label: 'Edge glow', min: 0, max: 6, step: 0.1 },
    { uniform: 'uEdgeColor', type: 'color', label: 'Edge colour' },
    { uniform: 'uBaseColor', type: 'color', label: 'Base colour' },
  ],
  layers: [
    { name: 'Surface', vertexShader: surfaceVertex, fragmentShader, options: { side: DoubleSide } },
  ],
  thumbTime: 1.6,
};
