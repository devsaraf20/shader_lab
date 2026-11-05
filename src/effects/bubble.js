import { Color, DoubleSide } from 'three';

const vertexShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform float uWobble;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;

void main() {
  // 1. Gentle wobble: push vertices in/out with slowly looping noise.
  float w = snoise(position * 1.5 + loopCircle(0.5)) * uWobble;
  vec3 p = position + normal * w;

  vec4 worldPos = modelMatrix * vec4(p, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vObjPos = position;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform float uThickness;   // average soap film thickness, in nanometres
uniform float uFilmIOR;     // refractive index of soapy water (~1.33)
uniform float uSwirl;       // how much the thickness swirls around
uniform float uOpacity;
uniform vec3  uTint;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;

// Thin-film interference: light bouncing off the front and back of the film
// travels a slightly different distance. Depending on the wavelength, the two
// bounces reinforce or cancel, which splits white light into rainbow bands.
vec3 thinFilm(float thicknessNm, float cosI, float ior) {
  float sinT2 = (1.0 - cosI * cosI) / (ior * ior);     // Snell's law
  float cosT = sqrt(max(1.0 - sinT2, 0.0));
  float opd = 2.0 * ior * thicknessNm * cosT;         // extra path length
  vec3 wavelengths = vec3(650.0, 510.0, 475.0);       // red, green, blue (nm)
  // One reflection flips phase, hence the minus: a half-wave difference = bright.
  return 0.5 - 0.5 * cos(TAU * opd / wavelengths);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float cosI = clamp(dot(N, V), 0.0, 1.0);

  // 1. Film thickness varies: swirling noise, and gravity drains the top thin.
  float swirl = fbm(vObjPos * 1.6 + loopCircle(0.35), 3);
  float drain = mix(1.35, 0.55, vObjPos.y * 0.5 + 0.5);
  float thickness = uThickness * drain * (1.0 + swirl * uSwirl);

  // 2. Interference colour for this thickness and viewing angle.
  vec3 film = thinFilm(thickness, cosI, uFilmIOR);

  // 3. Fresnel: bubbles are nearly invisible face-on, reflective at the edges.
  float F = fresnelSchlick(cosI, 0.04);

  // 4. Reflected environment: a soft sky plus two bright "windows".
  vec3 R = reflect(-V, N);
  float window = smoothstep(0.9, 0.97, dot(R, normalize(vec3(-0.5, 0.6, 0.6))))
               + smoothstep(0.95, 0.99, dot(R, normalize(vec3(0.7, 0.3, 0.6)))) * 0.6;
  vec3 env = mix(vec3(0.05, 0.06, 0.09), vec3(0.55, 0.6, 0.7), R.y * 0.5 + 0.5);

  vec3 col = film * uTint * (env + 0.35) * (0.35 + F * 1.6) + vec3(window) * 1.5;
  float alpha = clamp((0.08 + F * 1.2 + window) * uOpacity, 0.0, 1.0);
  if (!gl_FrontFacing) alpha *= 0.6;

  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'bubble',
  name: 'Soap Bubble',
  tagline: 'Thin-film interference with physical wavelengths',
  steps: [
    'Film thickness swirls with noise and thins out at the top.',
    'For red, green and blue wavelengths, compute whether the two reflections reinforce or cancel.',
    'Fresnel controls transparency: clear in the middle, shiny at the rim.',
  ],
  uniforms: () => ({
    uThickness: { value: 420 },
    uFilmIOR: { value: 1.33 },
    uSwirl: { value: 0.7 },
    uOpacity: { value: 1.0 },
    uWobble: { value: 0.03 },
    uTint: { value: new Color('#ffffff') },
  }),
  controls: [
    { uniform: 'uThickness', type: 'range', label: 'Film thickness (nm)', min: 100, max: 1200, step: 5 },
    { uniform: 'uFilmIOR', type: 'range', label: 'Film IOR', min: 1.0, max: 2.0, step: 0.01 },
    { uniform: 'uSwirl', type: 'range', label: 'Swirl', min: 0, max: 1.5, step: 0.01 },
    { uniform: 'uWobble', type: 'range', label: 'Wobble', min: 0, max: 0.15, step: 0.005 },
    { uniform: 'uOpacity', type: 'range', label: 'Opacity', min: 0.2, max: 2, step: 0.01 },
    { uniform: 'uTint', type: 'color', label: 'Tint' },
  ],
  layers: [
    {
      name: 'Film',
      vertexShader,
      fragmentShader,
      options: { transparent: true, depthWrite: false, side: DoubleSide },
    },
  ],
};
