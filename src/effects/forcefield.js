import { AdditiveBlending, Color, DoubleSide } from 'three';
import { createFloor, createOrbiters } from '../shaders/props.js';

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying vec2 vUv;
varying float vViewDepth;   // distance from the camera to this vertex

void main() {
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vViewDepth = -viewPos.z;  // the camera looks down -Z, so flip the sign
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vObjPos = position;
  vUv = uv;
  gl_Position = projectionMatrix * viewPos;
}
`;

const fragmentShader = /* glsl */ `
#include <sl_common>
#include <packing>

uniform sampler2D tDepth;    // depth of everything *except* the shield
uniform float uNear;
uniform float uFar;
uniform vec3  uColor;
uniform float uIntersectWidth;
uniform float uRimPower;
uniform float uHexScale;
uniform float uHexStrength;
uniform float uPulse;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying vec2 vUv;
varying float vViewDepth;

// Hexagon grid: returns (position inside the cell, cell id).
vec4 hexCoords(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  if (!gl_FrontFacing) N = -N;

  // 1. Read the depth of the scene behind this pixel. gl_FragCoord is the
  //    pixel position, so dividing by the resolution gives a 0..1 screen UV.
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  float sceneDepth = texture2D(tDepth, screenUv).x;
  float sceneDist = -perspectiveDepthToViewZ(sceneDepth, uNear, uFar);

  // 2. Intersection: where the shield is very close to something behind it.
  float gap = sceneDist - vViewDepth;
  float intersect = 1.0 - smoothstep(0.0, uIntersectWidth, gap);

  // 3. Fresnel rim, the classic "bubble shield" silhouette.
  float rim = fresnelRim(N, V, uRimPower);

  // 4. Hexagon cell borders, with a subtle per-cell shimmer.
  vec4 hex = hexCoords(vUv * vec2(uHexScale * 2.0, uHexScale));
  vec2 ah = abs(hex.xy);
  float edgeDist = 0.5 - max(dot(ah, vec2(0.5, 0.8660254)), ah.x);
  float hexLine = 1.0 - smoothstep(0.0, 0.06, edgeDist);
  float cellShimmer = 0.5 + 0.5 * sin(hash21(hex.zw) * TAU + uPhase * TAU * 2.0);

  // 5. Impact ripple: a ring expanding from a point, twice per loop.
  vec3 hitPoint = normalize(vec3(0.6, 0.4, 0.7));
  float ringRadius = fract(uPhase * 2.0) * 2.4;
  float ring = 1.0 - smoothstep(0.0, 0.12, abs(distance(normalize(vObjPos), hitPoint) - ringRadius));
  ring *= (1.0 - fract(uPhase * 2.0)) * uPulse;            // fade as it grows

  // 6. Add the layers. Additive blending makes them glow over the scene.
  float glow = rim * 0.9
             + intersect * 1.6
             + hexLine * uHexStrength * (0.25 + cellShimmer * 0.35 + ring * 2.0)
             + ring * 0.4
             + 0.03;
  vec3 col = uColor * glow + vec3(1.0) * intersect * intersect * 0.6;
  if (!gl_FrontFacing) col *= 0.5;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'forcefield',
  name: 'Force Field',
  tagline: 'Depth-based intersection glow, hex grid, ripples',
  steps: [
    'First the scene is rendered without the shield, keeping only its depth.',
    'The shield compares its own depth with that depth texture.',
    'Where the two are close (an object passes through), it glows.',
    'Fresnel rim, a hex pattern and an expanding ripple are added on top.',
  ],
  needsDepth: true,
  uniforms: () => ({
    tDepth: { value: null },
    uNear: { value: 0.1 },
    uFar: { value: 100 },
    uColor: { value: new Color('#3aa0ff') },
    uIntersectWidth: { value: 0.12 },
    uRimPower: { value: 2.5 },
    uHexScale: { value: 12 },
    uHexStrength: { value: 0.8 },
    uPulse: { value: 1.0 },
  }),
  controls: [
    { uniform: 'uColor', type: 'color', label: 'Colour' },
    { uniform: 'uIntersectWidth', type: 'range', label: 'Intersection width', min: 0.01, max: 0.5, step: 0.01 },
    { uniform: 'uRimPower', type: 'range', label: 'Rim power', min: 0.5, max: 6, step: 0.1 },
    { uniform: 'uHexScale', type: 'range', label: 'Hex scale', min: 4, max: 30, step: 1 },
    { uniform: 'uHexStrength', type: 'range', label: 'Hex strength', min: 0, max: 2, step: 0.01 },
    { uniform: 'uPulse', type: 'range', label: 'Impact ripple', min: 0, max: 2, step: 0.01 },
  ],
  layers: [
    {
      name: 'Shield',
      vertexShader,
      fragmentShader,
      options: { transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide },
    },
  ],
  props: (globals) => [createFloor(globals, -0.6, 10), createOrbiters(globals)],
};
