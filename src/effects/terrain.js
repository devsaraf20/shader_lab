import { Color } from 'three';
import { getDetailTexture } from '../shaders/textures.js';

const vertexShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform float uHeight;     // mountain height
uniform float uScale;      // continent size (smaller = bigger landmasses)
uniform float uSeaLevel;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;      // displaced position on the object (for triplanar)
varying vec3 vObjNormal;   // displaced normal on the object (for blend weights)
varying vec3 vBaseNormal;  // original normal (to measure slope)
varying float vElevation;  // raw height, -1..1 (water below uSeaLevel)

// Ridged fractal noise: abs() folds the noise so valleys become sharp ridges.
float terrainHeight(vec3 p) {
  float h = 0.0, amp = 0.55, freq = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = 1.0 - abs(snoise(p * freq * uScale));
    h += n * n * amp;
    freq *= 2.1;
    amp *= 0.48;
  }
  return h * 1.6 - 0.75;   // recentre roughly into -1..1
}

// Sea floor is flattened: anything below sea level stays at sea level.
float displacement(vec3 p) {
  return max(terrainHeight(p), uSeaLevel) * uHeight;
}
#include <sl_displace>

void main() {
  vec3 displaced;
  vec3 newNormal;
  displaceSurface(position, normal, 0.004, displaced, newNormal);
  vElevation = terrainHeight(position);

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * newNormal);
  vObjPos = displaced;
  vObjNormal = newNormal;
  vBaseNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = /* glsl */ `
#include <sl_common>

uniform sampler2D tDetail;      // tileable texture: R = rock grain, G = grass
uniform float uTexScale;
uniform float uBlendSharpness;  // how quickly the 3 projections blend
uniform float uSeaLevel;
uniform float uSnowLine;
uniform float uShowWeights;
uniform vec3  uWaterColor;
uniform vec3  uGrassColor;
uniform vec3  uRockColor;
uniform vec3  uSnowColor;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying vec3 vObjNormal;
varying vec3 vBaseNormal;
varying float vElevation;

// TRIPLANAR MAPPING: project the texture three times, along X, Y and Z, like
// three slide projectors, then blend by how much the surface faces each axis.
// No UVs needed, so no stretching or seams on steep cliffs.
vec4 triplanar(sampler2D tex, vec3 p, vec3 n, float scale) {
  vec3 w = pow(abs(n), vec3(uBlendSharpness));
  w /= (w.x + w.y + w.z);                   // weights must add up to 1
  vec4 xProj = texture2D(tex, p.zy * scale); // projector looking along X
  vec4 yProj = texture2D(tex, p.xz * scale); // projector looking along Y (top-down)
  vec4 zProj = texture2D(tex, p.xy * scale); // projector looking along Z
  return xProj * w.x + yProj * w.y + zProj * w.z;
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 n = normalize(vObjNormal);

  // Debug view: show the blend weights as red/green/blue.
  if (uShowWeights > 0.5) {
    vec3 w = pow(abs(n), vec3(uBlendSharpness));
    gl_FragColor = vec4(w / (w.x + w.y + w.z), 1.0);
    #include <colorspace_fragment>
    return;
  }

  // 1. Sample the detail texture with triplanar projection.
  vec4 detail = triplanar(tDetail, vObjPos, n, uTexScale);

  // 2. Slope: 0 = flat ground, 1 = vertical cliff (compared to the original surface).
  float slope = 1.0 - clamp(dot(n, normalize(vBaseNormal)), 0.0, 1.0);

  // 3. Pick materials by elevation and slope.
  vec3 grass = uGrassColor * (0.7 + detail.g * 0.6);
  vec3 rock  = uRockColor  * (0.5 + detail.r * 0.9);
  vec3 sand  = vec3(0.76, 0.68, 0.5) * (0.85 + detail.g * 0.3);
  float h = vElevation;
  vec3 col = mix(sand, grass, smoothstep(uSeaLevel + 0.02, uSeaLevel + 0.1, h));
  col = mix(col, rock, smoothstep(0.12, 0.3, slope + detail.r * 0.15));
  float snow = smoothstep(uSnowLine - 0.05, uSnowLine + 0.05, h + detail.r * 0.1 - slope * 0.4);
  col = mix(col, uSnowColor, snow);

  // 4. Water below sea level, deeper = darker.
  float water = 1.0 - step(uSeaLevel, h);
  vec3 waterCol = mix(uWaterColor * 0.4, uWaterColor, smoothstep(uSeaLevel - 0.6, uSeaLevel, h));

  // 5. Lighting: sun + soft sky + water gets a specular glint.
  vec3 L = normalize(vec3(0.5, 0.8, 0.4));
  vec3 V = normalize(cameraPosition - vWorldPos);
  float diff = max(dot(N, L), 0.0);
  vec3 lit = col * (diff * vec3(1.0, 0.95, 0.85) + vec3(0.12, 0.15, 0.22));
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 80.0);
  vec3 waterLit = waterCol * (diff * 0.7 + 0.3) + spec * 0.8;
  col = mix(lit, waterLit, water);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'terrain',
  name: 'Triplanar Terrain',
  tagline: 'Ridged noise displacement with triplanar texturing',
  steps: [
    'Ridged fractal noise lifts vertices into mountains; below sea level stays flat.',
    'A tileable texture is projected along X, Y and Z and blended by the normal (triplanar).',
    'Elevation and slope choose sand, grass, rock, snow or water.',
    'Toggle “Show blend weights” to see the three projections.',
  ],
  uniforms: () => ({
    tDetail: { value: getDetailTexture() },
    uHeight: { value: 0.22 },
    uScale: { value: 1.3 },
    uSeaLevel: { value: -0.05 },
    uSnowLine: { value: 0.55 },
    uTexScale: { value: 2.5 },
    uBlendSharpness: { value: 4 },
    uShowWeights: { value: 0 },
    uWaterColor: { value: new Color('#1d6fa3') },
    uGrassColor: { value: new Color('#4f7a2c') },
    uRockColor: { value: new Color('#6e6258') },
    uSnowColor: { value: new Color('#f2f5fa') },
  }),
  controls: [
    { uniform: 'uHeight', type: 'range', label: 'Mountain height', min: 0, max: 0.5, step: 0.005 },
    { uniform: 'uScale', type: 'range', label: 'Noise scale', min: 0.3, max: 4, step: 0.05 },
    { uniform: 'uSeaLevel', type: 'range', label: 'Sea level', min: -0.8, max: 0.6, step: 0.01 },
    { uniform: 'uSnowLine', type: 'range', label: 'Snow line', min: 0, max: 1.2, step: 0.01 },
    { uniform: 'uTexScale', type: 'range', label: 'Texture scale', min: 0.5, max: 8, step: 0.1 },
    { uniform: 'uBlendSharpness', type: 'range', label: 'Blend sharpness', min: 1, max: 16, step: 0.5 },
    { uniform: 'uShowWeights', type: 'toggle', label: 'Show blend weights' },
    { uniform: 'uWaterColor', type: 'color', label: 'Water' },
    { uniform: 'uGrassColor', type: 'color', label: 'Grass' },
    { uniform: 'uRockColor', type: 'color', label: 'Rock' },
    { uniform: 'uSnowColor', type: 'color', label: 'Snow' },
  ],
  layers: [{ name: 'Surface', vertexShader, fragmentShader }],
};
