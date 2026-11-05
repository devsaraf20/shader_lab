import { createBackdrop, createFloor, showcaseShader, showcaseUniforms } from '../shaders/props.js';

// Full-screen pass: a 2x2 plane whose corners already sit at the screen
// corners (-1..1), so no camera maths is needed.
export const postVertex = /* glsl */ `
varying vec2 vUv;   // 0..1 across the screen
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// The object under a post effect uses a colourful showcase material, and the
// scene gets a gridded backdrop so there is lots of detail to distort.
export const showcaseLayer = {
  name: 'Object',
  vertexShader: showcaseShader.vertexShader,
  fragmentShader: showcaseShader.fragmentShader,
};
export { showcaseUniforms };
export const postProps = (globals) => [createBackdrop(globals), createFloor(globals, -1.15, 14)];
