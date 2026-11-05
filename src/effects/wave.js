import { Color, DoubleSide } from 'three';

const vertexShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform float uAmplitude;
uniform float uFrequency;
uniform float uSpeed;      // whole cycles per loop
uniform float uNoiseMix;
uniform float uTwist;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vDisp;       // how far this vertex moved (for colouring)

// The shape of the deformation: ripples travelling up the object plus a
// circular wave and some looping noise.
float displacement(vec3 p) {
  float t = uPhase * TAU * uSpeed;
  float d = sin(p.y * uFrequency - t);
  d += 0.5 * sin(length(p.xz) * uFrequency * 1.5 + t * 2.0);
  d = mix(d, snoise(p * uFrequency * 0.35 + loopCircle(0.8)) * 1.5, uNoiseMix);
  return d * uAmplitude;
}
#include <sl_displace>

// Rotate around the Y axis.
vec3 rotateY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

void main() {
  // 1. Twist: rotate each vertex around Y by an amount that depends on height.
  float angle = position.y * uTwist * loopSin(1.0);
  vec3 p = rotateY(position, angle);
  vec3 n = rotateY(normal, angle);

  // 2. Push along the normal and recompute the normal from neighbours.
  vec3 displaced;
  vec3 newNormal;
  displaceSurface(p, n, 0.01, displaced, newNormal);
  vDisp = displacement(p) / max(uAmplitude, 1e-4);

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * newNormal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = /* glsl */ `
#include <sl_common>

uniform vec3 uColorA;   // colour in the troughs
uniform vec3 uColorB;   // colour on the peaks

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vDisp;

void main() {
  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(vec3(0.4, 0.9, 0.6));

  // 1. Colour from displacement: troughs = A, peaks = B.
  vec3 albedo = mix(uColorA, uColorB, smoothstep(-1.0, 1.0, vDisp));

  // 2. Lighting reveals the new shape thanks to the rebuilt normals.
  float diff = max(dot(N, L), 0.0) * 0.75 + 0.25;
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 40.0) * 0.5;
  float rim = fresnelRim(N, V, 3.0) * 0.5;

  vec3 col = albedo * diff + spec + rim * uColorB;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'wave',
  name: 'Vertex Waves',
  tagline: 'Animated vertex displacement with rebuilt normals',
  steps: [
    'All movement happens in the vertex shader: vertices slide along their normals.',
    'A twist rotates vertices around Y by an amount that depends on their height.',
    'Normals are recomputed from displaced neighbours so light follows the new shape.',
    'The fragment shader colours by how far each point moved.',
  ],
  uniforms: () => ({
    uAmplitude: { value: 0.1 },
    uFrequency: { value: 7 },
    uSpeed: { value: 1 },
    uNoiseMix: { value: 0.25 },
    uTwist: { value: 0.6 },
    uColorA: { value: new Color('#3b1c8c') },
    uColorB: { value: new Color('#ff9e6d') },
  }),
  controls: [
    { uniform: 'uAmplitude', type: 'range', label: 'Amplitude', min: 0, max: 0.3, step: 0.005 },
    { uniform: 'uFrequency', type: 'range', label: 'Frequency', min: 1, max: 20, step: 0.1 },
    { uniform: 'uSpeed', type: 'range', label: 'Speed (cycles/loop)', min: -4, max: 4, step: 1 },
    { uniform: 'uNoiseMix', type: 'range', label: 'Noise mix', min: 0, max: 1, step: 0.01 },
    { uniform: 'uTwist', type: 'range', label: 'Twist', min: 0, max: 2, step: 0.01 },
    { uniform: 'uColorA', type: 'color', label: 'Trough colour' },
    { uniform: 'uColorB', type: 'color', label: 'Peak colour' },
  ],
  layers: [{ name: 'Surface', vertexShader, fragmentShader, options: { side: DoubleSide } }],
};
