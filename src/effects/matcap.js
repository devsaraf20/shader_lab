import { Color } from 'three';
import { getMatcaps } from '../shaders/textures.js';

const vertexShader = /* glsl */ `
varying vec3 vViewNormal;   // normal relative to the camera
varying vec3 vViewPos;      // vector from this point to the camera
varying vec3 vObjPos;

void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  // normalMatrix rotates normals into camera ("view") space
  vViewNormal = normalize(normalMatrix * normal);
  vViewPos = -mvPos.xyz;
  vObjPos = position;
  gl_Position = projectionMatrix * mvPos;
}
`;

const fragmentShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform sampler2D tMatcap;  // a picture of a lit sphere
uniform vec3  uTint;
uniform float uBump;        // noise bumps, to show matcaps react to normals
uniform float uBumpScale;

varying vec3 vViewNormal;
varying vec3 vViewPos;
varying vec3 vObjPos;

void main() {
  vec3 n = normalize(vViewNormal);
  if (!gl_FrontFacing) n = -n;

  // 1. Optional bumps: tilt the normal by the slope of a noise field.
  if (uBump > 0.0) {
    vec3 p = vObjPos * uBumpScale;
    float e = 0.02;
    float n0 = snoise(p);
    vec3 grad = vec3(snoise(p + vec3(e, 0, 0)) - n0, snoise(p + vec3(0, e, 0)) - n0, snoise(p + vec3(0, 0, e)) - n0) / e;
    n = normalize(n - grad * uBump * 0.05);
  }

  // 2. Build a small frame that faces the camera from this point, so the
  //    lookup stays correct at the edges of a wide-angle view.
  vec3 viewDir = normalize(vViewPos);
  vec3 x = normalize(vec3(viewDir.z, 0.0, -viewDir.x));
  vec3 y = cross(viewDir, x);

  // 3. The normal's sideways (x) and upward (y) parts, -1..1, become a
  //    0..1 texture coordinate on the matcap sphere picture.
  vec2 matcapUv = vec2(dot(x, n), dot(y, n)) * 0.495 + 0.5;
  vec3 col = texture2D(tMatcap, matcapUv).rgb * uTint;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'matcap',
  name: 'Matcap',
  tagline: 'Lighting baked into a sphere image',
  steps: [
    'A matcap is a picture of a lit sphere, baked here in JavaScript.',
    'The normal, seen from the camera, says which pixel of that sphere to use.',
    'No lights needed: shading always looks like the picture, from any angle.',
  ],
  uniforms: () => ({
    tMatcap: { value: getMatcaps()[0].value },
    uTint: { value: new Color('#ffffff') },
    uBump: { value: 0.35 },
    uBumpScale: { value: 6 },
  }),
  controls: [
    { uniform: 'tMatcap', type: 'select', label: 'Matcap', options: () => getMatcaps() },
    { uniform: 'uTint', type: 'color', label: 'Tint' },
    { uniform: 'uBump', type: 'range', label: 'Bumps', min: 0, max: 1, step: 0.01 },
    { uniform: 'uBumpScale', type: 'range', label: 'Bump scale', min: 1, max: 20, step: 0.5 },
  ],
  layers: [{ name: 'Surface', vertexShader, fragmentShader }],
};
