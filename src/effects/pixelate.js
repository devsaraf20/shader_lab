import { postVertex, postProps, showcaseLayer, showcaseUniforms } from './post-common.js';

const fragmentShader = /* glsl */ `
#include <sl_common>

uniform sampler2D tScene;
uniform float uPixelSize;   // size of one big pixel, in CSS pixels
uniform float uLevels;      // colour steps per channel
uniform float uDither;      // ordered dithering strength
uniform float uPalette;     // 0 = RGB, 1 = 4-shade green, 2 = 1-bit
uniform float uGrid;        // dark gaps between pixels

varying vec2 vUv;

// 4x4 Bayer matrix as a formula: a fixed pattern of thresholds that spreads
// rounding errors into a neat cross-hatch instead of ugly bands.
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  // 1. Snap the lookup to the centre of a big "cell": every pixel inside the
  //    cell reads the same colour, which makes the blocky look.
  vec2 cellSize = vec2(uPixelSize * uPixelRatio) / uResolution;
  vec2 cell = floor(vUv / cellSize);
  vec2 snappedUv = (cell + 0.5) * cellSize;
  vec3 col = texture2D(tScene, snappedUv).rgb;

  // 2. Quantise in gamma space (closer to how we perceive brightness),
  //    otherwise all the steps bunch up in the dark tones.
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  float threshold = bayer4(mod(cell, 4.0)) - 0.5;   // -0.5 .. 0.5
  float steps = max(uLevels - 1.0, 1.0);

  if (uPalette < 0.5) {
    // Full colour: round each channel to a few levels (+ dither nudge).
    col = floor(col * steps + 0.5 + threshold * uDither) / steps;
  } else {
    // Brightness only, then map to a tiny palette.
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    if (uPalette < 1.5) {
      float q = clamp(floor(luma * 3.0 + 0.5 + threshold * uDither), 0.0, 3.0);
      vec3 pal0 = vec3(0.06, 0.22, 0.06), pal1 = vec3(0.19, 0.38, 0.19);
      vec3 pal2 = vec3(0.55, 0.67, 0.06), pal3 = vec3(0.61, 0.74, 0.06);
      col = q < 0.5 ? pal0 : q < 1.5 ? pal1 : q < 2.5 ? pal2 : pal3;
    } else {
      col = vec3(step(0.5, luma + threshold * uDither * 0.5));
    }
  }
  col = pow(col, vec3(2.2));   // back to linear for output

  // 3. Optional grid: darken the border of each big pixel, like an LCD.
  vec2 inCell = fract(vUv / cellSize);
  float edge = step(inCell.x, 0.1) + step(inCell.y, 0.1);
  col *= 1.0 - min(edge, 1.0) * uGrid * 0.6;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  id: 'pixelate',
  name: 'Pixelate',
  tagline: 'Post-process pixel art with ordered dithering',
  kind: 'post',
  steps: [
    'Render the scene to a texture, then draw it again on a full-screen quad.',
    'Snap each pixel’s lookup to the centre of a big cell.',
    'Round colours to a few levels, using a Bayer pattern to dither.',
    'Optionally remap to a retro palette and draw LCD-style gaps.',
  ],
  uniforms: () => ({
    ...showcaseUniforms(),
    tScene: { value: null },
    uPixelSize: { value: 6 },
    uLevels: { value: 5 },
    uDither: { value: 0.6 },
    uPalette: { value: 0 },
    uGrid: { value: 0 },
  }),
  controls: [
    { uniform: 'uPixelSize', type: 'range', label: 'Pixel size', min: 1, max: 24, step: 1 },
    { uniform: 'uLevels', type: 'range', label: 'Colour levels', min: 2, max: 16, step: 1 },
    { uniform: 'uDither', type: 'range', label: 'Dither', min: 0, max: 1.5, step: 0.01 },
    {
      uniform: 'uPalette',
      type: 'select',
      label: 'Palette',
      options: () => [
        { label: 'Full colour', value: 0 },
        { label: 'Handheld green', value: 1 },
        { label: '1-bit', value: 2 },
      ],
    },
    { uniform: 'uGrid', type: 'toggle', label: 'LCD grid' },
    { uniform: 'uColorA', type: 'color', label: 'Object colour A' },
    { uniform: 'uColorB', type: 'color', label: 'Object colour B' },
  ],
  layers: [showcaseLayer],
  post: { name: 'Post-process', vertexShader: postVertex, fragmentShader },
  props: postProps,
};
