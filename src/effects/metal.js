import { Color } from 'three';
import { surfaceVertex } from './common.js';

const fragmentShader = /* glsl */ `
#include <sl_common>
#include <sl_noise>

uniform vec3  uBaseColor;
uniform float uRoughX;       // highlight width along the brush direction
uniform float uRoughY;       // highlight width across the brush direction
uniform float uAngle;        // rotate the brushing direction (radians)
uniform float uBrushScale;   // how fine the brush scratches are
uniform float uBrushStrength;
uniform vec3  uKeyColor;
uniform vec3  uFillColor;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;

// Build a tangent frame (T = brush direction) from how the UVs change across
// the screen. This works on any mesh, no tangent attribute required.
void tangentFrame(vec3 N, vec3 p, vec2 uv, out vec3 T, out vec3 B) {
  vec3 dp1 = dFdx(p);  vec3 dp2 = dFdy(p);
  vec2 du1 = dFdx(uv); vec2 du2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  T = dp2perp * du1.x + dp1perp * du2.x;
  B = dp2perp * du1.y + dp1perp * du2.y;
  float invMax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  T *= invMax; B *= invMax;
}

// Ward anisotropic specular: a highlight stretched along one direction,
// the look of brushed aluminium, vinyl records or hair.
float ward(vec3 N, vec3 T, vec3 B, vec3 L, vec3 V, float ax, float ay) {
  vec3 H = normalize(L + V);
  float NdL = max(dot(N, L), 0.0);
  float NdV = max(dot(N, V), 1e-3);
  float NdH = max(dot(N, H), 1e-3);
  float hx = dot(H, T) / ax;
  float hy = dot(H, B) / ay;
  float e = -2.0 * (hx * hx + hy * hy) / (1.0 + NdH);
  return NdL * exp(e) / (4.0 * PI * ax * ay * sqrt(max(NdL * NdV, 1e-4)));
}

// Fake studio environment: soft grey gradient with two bright softboxes.
vec3 studio(vec3 R, float blur) {
  vec3 col = mix(vec3(0.03), vec3(0.3), smoothstep(-0.6, 0.9, R.y));
  float box1 = smoothstep(0.35 + blur, 0.35 - blur, abs(R.x - 0.5)) * smoothstep(-0.1 - blur, 0.4, R.y);
  float box2 = smoothstep(0.2 + blur, 0.2 - blur, abs(R.x + 0.7)) * smoothstep(-0.3 - blur, 0.3, R.y);
  return col + uKeyColor * box1 * 0.8 + uFillColor * box2 * 0.5;
}

void main() {
  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorldPos);

  // 1. Tangent frame, then rotate it by the brush angle.
  vec3 T0, B0;
  tangentFrame(N, vWorldPos, vUv, T0, B0);
  vec3 T = normalize(cos(uAngle) * T0 + sin(uAngle) * B0);
  T = normalize(T - N * dot(N, T));       // keep it flat on the surface
  vec3 B = cross(N, T);

  // 2. Brush scratches: noise stretched hugely along the brush direction.
  vec2 r = mat2(cos(uAngle), -sin(uAngle), sin(uAngle), cos(uAngle)) * vUv;
  float scratch = snoise(vec3(r.x * 2.0, r.y * uBrushScale, 0.0)) * 0.5
                + snoise(vec3(r.x * 6.0, r.y * uBrushScale * 2.7, 4.0)) * 0.5;
  // Scratches tilt the bitangent a little, which breaks up the highlight.
  B = normalize(B + N * scratch * 0.15 * uBrushStrength);

  // 3. Two lights with anisotropic highlights.
  vec3 L1 = normalize(vec3(0.7, 0.6, 0.5));
  vec3 L2 = normalize(vec3(-0.8, 0.2, 0.3));
  vec3 spec = uKeyColor * ward(N, T, B, L1, V, uRoughX, uRoughY)
            + uFillColor * ward(N, T, B, L2, V, uRoughX, uRoughY) * 0.6;

  // 4. Reflection of the studio, blurrier when rougher.
  vec3 R = reflect(-V, N);
  vec3 env = studio(R, 0.12 + (uRoughX + uRoughY) * 0.5);

  // 5. Metals tint their reflections with their own colour (no diffuse).
  float F = fresnelSchlick(dot(N, V), 0.6);
  vec3 col = uBaseColor * (env * F + spec * 0.25);
  col *= 1.0 + scratch * 0.08 * uBrushStrength;   // faint visible grain

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'metal',
  name: 'Brushed Metal',
  tagline: 'Anisotropic Ward highlights along a tangent',
  steps: [
    'Build a tangent (brush direction) from screen-space UV derivatives.',
    'The Ward model stretches the highlight along that tangent.',
    'Stretched noise adds scratches and wobbles the highlight.',
    'A fake studio environment provides reflections.',
  ],
  uniforms: () => ({
    uBaseColor: { value: new Color('#d6dae2') },
    uRoughX: { value: 0.06 },
    uRoughY: { value: 0.45 },
    uAngle: { value: 0 },
    uBrushScale: { value: 450 },
    uBrushStrength: { value: 0.7 },
    uKeyColor: { value: new Color('#fff1dc') },
    uFillColor: { value: new Color('#8fb8ff') },
  }),
  controls: [
    { uniform: 'uBaseColor', type: 'color', label: 'Metal tint' },
    { uniform: 'uRoughX', type: 'range', label: 'Roughness along', min: 0.02, max: 0.6, step: 0.005 },
    { uniform: 'uRoughY', type: 'range', label: 'Roughness across', min: 0.02, max: 0.8, step: 0.005 },
    { uniform: 'uAngle', type: 'range', label: 'Brush angle', min: 0, max: 3.1416, step: 0.01 },
    { uniform: 'uBrushScale', type: 'range', label: 'Scratch density', min: 50, max: 1200, step: 10 },
    { uniform: 'uBrushStrength', type: 'range', label: 'Scratch strength', min: 0, max: 2, step: 0.01 },
    { uniform: 'uKeyColor', type: 'color', label: 'Key light' },
    { uniform: 'uFillColor', type: 'color', label: 'Fill light' },
  ],
  layers: [{ name: 'Surface', vertexShader: surfaceVertex, fragmentShader }],
};
