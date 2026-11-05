// The "Shader code" tab: lets you browse every program an effect uses
// (e.g. Outline + Surface, or Object + Post-process), switch between the
// vertex and fragment stage, and see the shared chunks it #includes.
import { chunks, builtinIncludes } from '../shaders/chunks.js';
import { highlightGLSL } from './highlight.js';

const INCLUDE_RE = /#include\s+<([\w.]+)>/g;

function programsFor(effect) {
  const list = effect.layers.map((l) => ({ name: l.name, vertex: l.vertexShader, fragment: l.fragmentShader }));
  if (effect.post) list.push({ name: effect.post.name, vertex: effect.post.vertexShader, fragment: effect.post.fragmentShader });
  return list;
}

function includesIn(...sources) {
  const found = new Set();
  for (const s of sources) for (const m of s.matchAll(INCLUDE_RE)) found.add(m[1]);
  return [...found];
}

export function createCodeView(root) {
  const programBar = root.querySelector('[data-programs]');
  const stageBar = root.querySelector('[data-stages]');
  const codeEl = root.querySelector('code');
  const fileEl = root.querySelector('[data-file]');
  const copyBtn = root.querySelector('[data-copy]');
  let state = { effect: null, program: 0, stage: 'fragment' };
  let currentSource = '';

  function chip(label, active, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip${active ? ' active' : ''}`;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    const programs = programsFor(state.effect);
    const program = programs[state.program] || programs[0];
    const includes = includesIn(program.vertex, program.fragment);

    programBar.replaceChildren(...programs.map((p, i) =>
      chip(p.name, i === state.program, () => { state.program = i; state.stage = 'fragment'; render(); })));
    programBar.hidden = programs.length < 2;

    const stages = [['vertex', 'Vertex'], ['fragment', 'Fragment'], ...includes.map((n) => [`inc:${n}`, `<${n}>`])];
    stageBar.replaceChildren(...stages.map(([key, label]) =>
      chip(label, key === state.stage, () => { state.stage = key; render(); })));

    if (state.stage.startsWith('inc:')) {
      const name = state.stage.slice(4);
      currentSource = (chunks[name] || builtinIncludes[name] || `// three.js built-in chunk: ${name}`).trim();
      fileEl.textContent = chunks[name] ? `src/shaders/chunks.js  ·  ${name}` : `three.js  ·  ${name}`;
    } else {
      currentSource = program[state.stage].trim();
      fileEl.textContent = `src/effects/${state.effect.id}.js  ·  ${program.name} ${state.stage} shader`;
    }
    codeEl.innerHTML = highlightGLSL(currentSource);
    codeEl.parentElement.scrollTop = 0;
  }

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentSource);
      copyBtn.textContent = 'Copied';
    } catch {
      copyBtn.textContent = 'Copy failed';
    }
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1400);
  });

  return {
    show(effect) {
      const programs = programsFor(effect);
      // Default to the most interesting program: the last one (surface / post).
      state = { effect, program: programs.length - 1, stage: 'fragment' };
      render();
    },
  };
}
