import { Color } from 'three';

const vertexShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform float uWaveHeight;
uniform float uWaveScale;
uniform float uWaveSpeed;   // whole cycles per loop

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying float vHeight;      // -1..1, used for foam on the crests

// Sum of travelling sine waves in different directions, plus a little noise.
// Each wave has its own direction, frequency and an integer speed so the
// whole sea repeats perfectly every loop.
float waves(vec3 p) {
  float t = uPhase * TAU * uWaveSpeed;
  float h = 0.0;
  h += sin(dot(p, normalize(vec3( 1.0, 0.2,  0.4))) * uWaveScale * 3.0 + t)       * 0.50;
  h += sin(dot(p, normalize(vec3(-0.3, 0.7,  1.0))) * uWaveScale * 5.1 + t * 2.0) * 0.25;
  h += sin(dot(p, normalize(vec3( 0.6, -1.0, 0.2))) * uWaveScale * 8.3 - t * 3.0) * 0.125;
  h += snoise(p * uWaveScale * 1.5 + loopCircle(0.6)) * 0.15;
  return h;
}

float displacement(vec3 p) { return waves(p) * uWaveHeight; }
#include <sl_displace>

void main() {
  // 1. Move the vertex up/down along its normal and rebuild the normal.
  vec3 displaced;
  vec3 newNormal;
  displaceSurface(position, normal, 0.01, displaced, newNormal);
  vHeight = waves(position) / 1.1;

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * newNormal);
  vObjPos = position;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform vec3  uDeepColor;
uniform vec3  uShallowColor;
uniform vec3  uSkyColor;
uniform float uReflectivity;  // Fresnel F0: reflection when looking straight down
uniform float uFoam;
uniform float uSun;
uniform float uWaveScale;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying float vHeight;

// A fake sky: dark at the horizon-bottom, bright overhead.
vec3 sky(vec3 dir) {
  float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  return mix(uDeepColor * 0.6, uSkyColor, pow(up, 0.7));
}

void main() {
  // 1. Fine ripples: nudge the normal using the slope of a small noise field.
  vec3 p = vObjPos * uWaveScale * 9.0 + loopCircle(0.8);
  float e = 0.05;
  float n0 = snoise(p);
  vec3 grad = vec3(snoise(p + vec3(e, 0, 0)) - n0, snoise(p + vec3(0, e, 0)) - n0, snoise(p + vec3(0, 0, e)) - n0) / e;
  vec3 N = normalize(normalize(vWorldNormal) - grad * 0.03);
  vec3 V = normalize(cameraPosition - vWorldPos);

  // 2. Fresnel: looking straight in you see the water colour; at grazing
  //    angles the surface turns into a mirror and reflects the sky.
  float F = fresnelSchlick(dot(N, V), uReflectivity);

  // 3. Body colour: deeper troughs are darker, crests let light through.
  vec3 body = mix(uDeepColor, uShallowColor, smoothstep(-0.6, 0.9, vHeight));

  // 4. Reflection of the sky + a sharp sun glint.
  vec3 R = reflect(-V, N);
  vec3 sunDir = normalize(vec3(-0.4, 0.6, -0.7));
  vec3 refl = sky(R) + vec3(1.0, 0.9, 0.7) * pow(max(dot(R, sunDir), 0.0), 600.0) * uSun * 6.0;
  vec3 col = mix(body, refl, F);

  // 5. Foam where waves peak, broken up by noise so it looks frothy.
  float foamNoise = snoise(vObjPos * 14.0 + loopCircle(0.5)) * 0.5 + 0.5;
  float foam = smoothstep(0.7, 1.0, vHeight + foamNoise * 0.3 - 0.1) * uFoam;
  col = mix(col, vec3(0.92, 0.97, 1.0), foam);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'water',
  name: 'Water',
  tagline: 'Layered sine waves, Fresnel reflection, foam',
  steps: [
    'The vertex shader sums sine waves and moves vertices along their normals.',
    'Normals are rebuilt from neighbouring displaced points so lighting follows the waves.',
    'Fresnel blends water colour (facing you) with sky reflection (edge-on).',
    'Wave crests get noisy foam.',
  ],
  uniforms: () => ({
    uDeepColor: { value: new Color('#032238') },
    uShallowColor: { value: new Color('#16a3a0') },
    uSkyColor: { value: new Color('#a8d8ff') },
    uWaveHeight: { value: 0.07 },
    uWaveScale: { value: 1.4 },
    uWaveSpeed: { value: 1 },
    uReflectivity: { value: 0.03 },
    uFoam: { value: 0.8 },
    uSun: { value: 1.0 },
  }),
  controls: [
    { uniform: 'uWaveHeight', type: 'range', label: 'Wave height', min: 0, max: 0.2, step: 0.005 },
    { uniform: 'uWaveScale', type: 'range', label: 'Wave scale', min: 0.3, max: 4, step: 0.05 },
    { uniform: 'uWaveSpeed', type: 'range', label: 'Speed (cycles/loop)', min: 0, max: 4, step: 1 },
    { uniform: 'uReflectivity', type: 'range', label: 'Reflectivity (F0)', min: 0, max: 0.5, step: 0.005 },
    { uniform: 'uFoam', type: 'range', label: 'Foam', min: 0, max: 1, step: 0.01 },
    { uniform: 'uSun', type: 'range', label: 'Sun glint', min: 0, max: 2, step: 0.01 },
    { uniform: 'uDeepColor', type: 'color', label: 'Deep colour' },
    { uniform: 'uShallowColor', type: 'color', label: 'Shallow colour' },
    { uniform: 'uSkyColor', type: 'color', label: 'Sky colour' },
  ],
  layers: [{ name: 'Surface', vertexShader, fragmentShader }],
};
