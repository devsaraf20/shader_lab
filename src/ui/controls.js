// Builds the live control panel for an effect from its `controls` list.
// Every input writes straight into a uniform's .value; the next frame the
// GPU sees the new number. No re-compiling, no re-building: that is the
// whole point of uniforms.
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
};

function decimalsFor(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

function rangeControl(c, uniform) {
  const id = `ctl-${c.uniform}`;
  const out = el('output', { class: 'ctl-value', for: id });
  const fmt = (v) => Number(v).toFixed(decimalsFor(c.step));
  const input = el('input', {
    id, type: 'range', min: c.min, max: c.max, step: c.step, value: uniform.value,
  });
  const sync = () => {
    out.textContent = fmt(uniform.value);
    const pct = ((uniform.value - c.min) / (c.max - c.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  };
  input.addEventListener('input', () => {
    uniform.value = parseFloat(input.value);
    sync();
  });
  sync();
  return el('div', { class: 'ctl ctl-range' },
    el('div', { class: 'ctl-row' }, el('label', { for: id }, c.label), out),
    input);
}

function colorControl(c, uniform) {
  const id = `ctl-${c.uniform}`;
  const hex = () => `#${uniform.value.getHexString()}`;
  const code = el('code', { class: 'ctl-value' }, hex());
  const input = el('input', { id, type: 'color', value: hex() });
  input.addEventListener('input', () => {
    // Color.set() converts the sRGB picker value into linear for the shader
    uniform.value.set(input.value);
    code.textContent = input.value;
  });
  return el('div', { class: 'ctl ctl-color' },
    el('label', { for: id }, c.label),
    el('div', { class: 'ctl-color-wrap' }, code, el('span', { class: 'swatch' }, input)));
}

function toggleControl(c, uniform) {
  const id = `ctl-${c.uniform}`;
  const input = el('input', { id, type: 'checkbox', role: 'switch' });
  input.checked = uniform.value > 0.5;
  // GLSL has no reliable bool uniforms in every driver, so we send 0.0 / 1.0
  input.addEventListener('change', () => (uniform.value = input.checked ? 1 : 0));
  return el('div', { class: 'ctl ctl-toggle' },
    el('label', { for: id }, c.label),
    el('span', { class: 'switch' }, input, el('span', { class: 'switch-track' })));
}

function selectControl(c, uniform) {
  const id = `ctl-${c.uniform}`;
  const options = c.options();
  const select = el('select', { id });
  options.forEach((o, i) => {
    const opt = el('option', { value: i }, o.label);
    if (o.value === uniform.value) opt.selected = true;
    select.append(opt);
  });
  select.addEventListener('change', () => (uniform.value = options[select.selectedIndex].value));
  return el('div', { class: 'ctl ctl-select' }, el('label', { for: id }, c.label), select);
}

const builders = { range: rangeControl, color: colorControl, toggle: toggleControl, select: selectControl };

export function buildControls(container, effect, uniforms, onReset) {
  container.replaceChildren();
  const list = el('div', { class: 'ctl-list' });
  for (const c of effect.controls) {
    const uniform = uniforms[c.uniform];
    if (!uniform) continue;
    list.append(builders[c.type](c, uniform));
  }
  const steps = el('ol', { class: 'steps' }, ...effect.steps.map((s) => el('li', {}, inlineCode(s))));
  container.append(
    el('div', { class: 'panel-intro' },
      el('p', { class: 'tagline' }, effect.tagline),
      el('details', { class: 'how', open: '' }, el('summary', {}, 'How it works'), steps)),
    el('div', { class: 'ctl-head' },
      el('span', {}, 'Uniforms'),
      el('button', { class: 'btn-ghost small', type: 'button', onclick: onReset }, 'Reset')),
    list,
  );
}

// Render `code` spans inside the step descriptions.
function inlineCode(text) {
  const frag = document.createDocumentFragment();
  text.split(/(`[^`]+`)/).forEach((part) => {
    if (part.startsWith('`')) frag.append(el('code', {}, part.slice(1, -1)));
    else frag.append(part);
  });
  return frag;
}
