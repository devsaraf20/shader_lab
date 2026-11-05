// -----------------------------------------------------------------------------
// Shared GLSL "chunks".
//
// Three.js lets a shader write `#include <name>` and pastes in the text stored in
// THREE.ShaderChunk[name] before compiling. We register our own reusable
// snippets here (prefixed `sl_` for Shader Lab) so every effect can share the
// same noise, fresnel and loop helpers instead of copy-pasting them.
// -----------------------------------------------------------------------------
import { ShaderChunk } from 'three';

// Length of the animation loop in seconds. Every animated effect is written so
// that it repeats exactly every LOOP_SECONDS, which is what makes the
// "Record 5-second loop" button produce a seamless loop.
export const LOOP_SECONDS = 5;

export const chunks = {
  sl_common: /* glsl */ `
// ---- sl_common: globals + helpers shared by every effect ----
#define PI  3.14159265359
#define TAU 6.28318530718

uniform float uTime;        // seconds, wraps back to 0 every loop (5 s)
uniform float uPhase;       // 0 -> 1 progress through the loop
uniform vec2  uResolution;  // canvas size in real (device) pixels
uniform float uPixelRatio;  // device pixels per CSS pixel (2 on most phones)

// A sine that completes exactly "cycles" waves per loop. Whole numbers loop
// seamlessly; that is why many "speed" sliders snap to integers.
float loopSin(float cycles) { return sin(uPhase * TAU * cycles); }

// A point that travels once around a circle per loop. Adding it to a noise
// lookup makes the noise animate *and* return to where it started.
vec3 loopCircle(float radius) {
  return vec3(cos(uPhase * TAU), sin(uPhase * TAU), 0.0) * radius;
}

// Cheap pseudo-random numbers: same input -> same "random" output.
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Fresnel: surfaces facing you are 0, surfaces seen edge-on approach 1.
float fresnelRim(vec3 N, vec3 V, float power) {
  return pow(1.0 - clamp(dot(N, V), 0.0, 1.0), power);
}
// Schlick's physically based approximation. f0 = reflectance when facing you.
float fresnelSchlick(float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(cosTheta, 0.0, 1.0), 5.0);
}
`,

  sl_noise: /* glsl */ `
// ---- sl_noise: 3D simplex noise + fractal sum (fbm) ----
// Simplex noise by Ian McEwan & Stefan Gustavson (Ashima Arts), MIT licence.
// Input: any 3D point. Output: smooth random value in roughly -1..1.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  // Find which skewed (tetrahedral) cell we are in and its 4 corners
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  // Hash the corners into pseudo-random gradient directions
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x  = x_ * ns.x + ns.yyyy;
  vec4 y  = y_ * ns.x + ns.yyyy;
  vec4 h  = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  // Blend the 4 corner contributions with a smooth falloff
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// fbm = "fractal Brownian motion": stack several octaves of noise, each one
// twice as detailed and half as strong. Big shapes + medium bumps + fine grit.
float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * snoise(p);
    p = p * 2.02 + vec3(17.1, 3.7, 9.2); // shift so octaves don't line up
    amp *= 0.5;
  }
  return sum;
}
`,

  sl_displace: /* glsl */ `
// ---- sl_displace: move vertices along their normal and rebuild the normal ----
// Requires the including shader to define:  float displacement(vec3 p)
// Moving vertices breaks the original normals (lighting would look flat), so
// we displace two tiny neighbours too and take the cross product of the
// resulting edges, exactly like a modifier stack recalculating normals.
vec3 anyPerpendicular(vec3 n) {
  return normalize(abs(n.x) > abs(n.z) ? vec3(-n.y, n.x, 0.0) : vec3(0.0, -n.z, n.y));
}
void displaceSurface(vec3 p, vec3 n, float eps, out vec3 outPos, out vec3 outNormal) {
  vec3 t = anyPerpendicular(n);   // tangent
  vec3 b = normalize(cross(n, t)); // bitangent
  vec3 p0 = p + n * displacement(p);
  vec3 pt = p + t * eps; pt += n * displacement(pt);
  vec3 pb = p + b * eps; pb += n * displacement(pb);
  outPos = p0;
  outNormal = normalize(cross(pt - p0, pb - p0));
}
`,
};

// Register every chunk with three.js so `#include <sl_xxx>` works.
for (const [name, source] of Object.entries(chunks)) {
  ShaderChunk[name] = source;
}

// Short descriptions shown in the code viewer for includes we did not write.
export const builtinIncludes = {
  colorspace_fragment:
    '// Built into three.js. Converts the linear colour we computed into the\n// output colour space (sRGB for the screen):\ngl_FragColor = linearToOutputTexel( gl_FragColor );',
  packing:
    '// Built into three.js. Helper functions for packing/unpacking depth values,\n// including perspectiveDepthToViewZ(), which turns a 0..1 depth-buffer value\n// back into a distance from the camera.',
};
