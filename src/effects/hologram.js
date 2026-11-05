import { AdditiveBlending, Color, DoubleSide } from 'three';

const vertexShader = /* glsl */ `
#include <sl_common>

uniform float uGlitch;   // how often the glitch slices jump

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);

  // 1. Glitch: time is chopped into 48 steps per loop. Each step rolls a random
  //    number; if it is high enough, a thin horizontal slice jumps sideways.
  float stepId = floor(uPhase * 48.0);
  float glitchOn = step(1.0 - uGlitch * 0.35, hash11(stepId));
  float sliceY = hash11(stepId + 7.0) * 2.0 - 1.0;
  float inSlice = 1.0 - smoothstep(0.0, 0.08, abs(worldPos.y - sliceY));
  worldPos.x += glitchOn * inSlice * (hash11(stepId + 3.0) - 0.5) * 0.5;

  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = /* glsl */ `
#include <sl_common>

uniform vec3  uColor;
uniform float uFresnelPower;  // higher = thinner rim
uniform float uScanDensity;   // scanlines per world unit
uniform float uScanSpeed;     // whole cycles per loop
uniform float uFlicker;
uniform float uOpacity;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  if (!gl_FrontFacing) N = -N;

  // 1. Fresnel rim: edges glow, the middle is see-through.
  float rim = fresnelRim(N, V, uFresnelPower);

  // 2. Scanlines: a sine wave over world height, sharpened into thin lines.
  float wave = sin((vWorldPos.y * uScanDensity - uPhase * uScanSpeed) * TAU);
  float scan = smoothstep(0.6, 1.0, wave);

  // 3. A wide bright band that sweeps up the object once per loop.
  float bandPos = fract(vWorldPos.y * 0.3 - uPhase);
  float band = smoothstep(0.0, 0.1, bandPos) * smoothstep(0.25, 0.1, bandPos);

  // 4. Flicker: random brightness per time step, like an unstable projector.
  float flicker = 1.0 - uFlicker * hash11(floor(uPhase * 120.0));

  // 5. Combine. With additive blending, black = invisible, bright = glow.
  float intensity = (rim * 1.4 + scan * 0.35 + band * 0.5 + 0.06) * flicker * uOpacity;
  if (!gl_FrontFacing) intensity *= 0.45;   // back faces are fainter
  vec3 col = uColor * intensity + vec3(rim * rim) * 0.4 * uOpacity;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'hologram',
  name: 'Hologram',
  tagline: 'Fresnel rim, scanlines, flicker and glitch',
  steps: [
    'Fresnel makes the silhouette glow while the centre stays clear.',
    'A sine wave on world height becomes scrolling scanlines.',
    'Additive blending adds light on top of the background, like a projection.',
    'The vertex shader randomly shifts thin slices for a glitch.',
  ],
  uniforms: () => ({
    uColor: { value: new Color('#2fd8ff') },
    uFresnelPower: { value: 2.2 },
    uScanDensity: { value: 14 },
    uScanSpeed: { value: 2 },
    uFlicker: { value: 0.25 },
    uOpacity: { value: 1.0 },
    uGlitch: { value: 0.5 },
  }),
  controls: [
    { uniform: 'uColor', type: 'color', label: 'Colour' },
    { uniform: 'uFresnelPower', type: 'range', label: 'Fresnel power', min: 0.5, max: 6, step: 0.1 },
    { uniform: 'uScanDensity', type: 'range', label: 'Scanline density', min: 2, max: 60, step: 1 },
    { uniform: 'uScanSpeed', type: 'range', label: 'Scan speed (cycles/loop)', min: -6, max: 6, step: 1 },
    { uniform: 'uFlicker', type: 'range', label: 'Flicker', min: 0, max: 1, step: 0.01 },
    { uniform: 'uGlitch', type: 'range', label: 'Glitch', min: 0, max: 1, step: 0.01 },
    { uniform: 'uOpacity', type: 'range', label: 'Intensity', min: 0.1, max: 2, step: 0.01 },
  ],
  layers: [
    {
      name: 'Surface',
      vertexShader,
      fragmentShader,
      options: { transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide },
    },
  ],
};
