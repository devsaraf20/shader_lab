// The gallery, in display order. Each effect is a plain object that describes:
//   uniforms()  -> the starting values of every knob the shader exposes
//   controls    -> how to build the slider / colour / toggle UI for those knobs
//   layers      -> one or more meshes, each with a vertex + fragment shader
//   post        -> (optional) a full-screen post-process shader
//   props       -> (optional) extra scene objects, e.g. a floor
import dissolve from './dissolve.js';
import hologram from './hologram.js';
import toon from './toon.js';
import water from './water.js';
import forcefield from './forcefield.js';
import metal from './metal.js';
import bubble from './bubble.js';
import wave from './wave.js';
import terrain from './terrain.js';
import matcap from './matcap.js';
import heathaze from './heathaze.js';
import pixelate from './pixelate.js';

export const effects = [
  dissolve, hologram, toon, water, forcefield, metal,
  bubble, wave, terrain, matcap, heathaze, pixelate,
];
