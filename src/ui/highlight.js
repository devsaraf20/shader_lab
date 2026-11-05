// A small GLSL syntax highlighter. It walks through the source with one big
// regular expression; each named group is a kind of token, and each kind gets
// a CSS class (see .tok-* in style.css).

const KEYWORDS = [
  'attribute', 'uniform', 'varying', 'const', 'in', 'out', 'inout', 'void', 'return', 'if', 'else',
  'for', 'while', 'do', 'break', 'continue', 'discard', 'struct', 'precision', 'highp', 'mediump', 'lowp',
  'true', 'false',
];
const TYPES = [
  'float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'bvec2', 'bvec3', 'bvec4',
  'mat2', 'mat3', 'mat4', 'sampler2D', 'samplerCube',
];
const BUILTINS = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
  'abs', 'sign', 'floor', 'ceil', 'fract', 'mod', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
  'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract', 'texture2D', 'texture',
  'dFdx', 'dFdy', 'fwidth', 'radians', 'degrees',
];
const BUILTIN_VARS = [
  'gl_Position', 'gl_FragColor', 'gl_FragCoord', 'gl_FrontFacing', 'gl_PointSize',
  // provided automatically by three.js for every ShaderMaterial:
  'position', 'normal', 'uv', 'modelMatrix', 'viewMatrix', 'modelViewMatrix', 'projectionMatrix',
  'normalMatrix', 'cameraPosition',
];

const words = (list) => `\\b(?:${list.join('|')})\\b`;

const TOKEN = new RegExp(
  [
    '(?<comment>\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)',
    '(?<pre>^[ \\t]*#[^\\n]*)',
    '(?<number>\\b\\d+\\.?\\d*(?:e[-+]?\\d+)?\\b|\\.\\d+\\b)',
    `(?<keyword>${words(KEYWORDS)})`,
    `(?<type>${words(TYPES)})`,
    `(?<builtin>${words(BUILTINS)})`,
    `(?<var>${words(BUILTIN_VARS)})`,
    '(?<uniform>\\b[ut][A-Z]\\w*)',  // our naming: uSomething / tTexture
    '(?<varying>\\bv[A-Z]\\w*)',     // our naming: vSomething
    '(?<fn>\\b[a-zA-Z_]\\w*(?=\\s*\\())',
  ].join('|'),
  'gm',
);

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlightGLSL(source) {
  let html = '';
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    html += escapeHtml(source.slice(last, match.index));
    const kind = Object.keys(match.groups).find((k) => match.groups[k] !== undefined);
    html += `<span class="tok-${kind}">${escapeHtml(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(last));
  // Wrap each line so CSS can draw line numbers.
  return html
    .split('\n')
    .map((line) => `<span class="line">${line || ' '}</span>`)
    .join(''); // each line is a block element, so no newline characters needed
}
