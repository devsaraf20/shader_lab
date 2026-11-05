# LEARN: Shader Lab, explained

This guide is written for someone who knows **Blender** or **Unreal**, has built materials with nodes, but has never written web code or a shader by hand. It has two parts:

- **Part 1: Shader concepts.** Uniforms, varyings, Fresnel, noise and the other ideas the effects use, then a walk through how each of the 12 effects works.
- **Part 2: The code.** Every major file in this project and what it does, in plain language.

Open the app next to this file. Every effect has a **Shader code** tab, so you can read the real GLSL while you read the explanation.

---

## Part 1: Shader concepts

### What is a shader?

A shader is a small program that runs on the graphics card (GPU). It runs once for **every vertex** and once for **every pixel**, millions of times per frame, all at the same time. That is why shaders are fast, and also why they feel unusual to write: each run only knows about *its own* vertex or pixel and cannot look at its neighbours.

When you build a material in Blender's Shader Editor or Unreal's Material Editor, the app turns your node graph into a shader just like these. Here we skip the nodes and write the text directly. The language is **GLSL** (OpenGL Shading Language), which looks a lot like C.

Every material in this project has two shaders:

| Stage | Runs once per… | Its job | Node-editor equivalent |
|---|---|---|---|
| **Vertex shader** | vertex (corner of a triangle) | Decide *where* the vertex appears on screen. It can move vertices. | Unreal: *World Position Offset*. Blender: *Displacement* output |
| **Fragment shader** (also called pixel shader) | pixel the triangle covers | Decide *what colour* that pixel is. | Unreal: *Base Color / Emissive / Opacity*. Blender: the *Surface* output |

The GPU runs the vertex shader for all vertices, fills in the triangles, then runs the fragment shader for every pixel inside them.

### GLSL in five minutes

```glsl
float a = 0.5;                 // a single number. ALWAYS write 0.5 or 1.0, never 1
vec3  colour = vec3(1.0, 0.5, 0.0);   // 3 numbers: RGB, or XYZ
vec2  uv = colour.xy;          // "swizzling": grab components by name
float d = dot(n, l);           // built-in maths: dot, cross, normalize, mix...
gl_FragColor = vec4(colour, 1.0);     // the fragment shader's output: RGBA
```

Built-in functions you will see everywhere, with their node equivalents:

| GLSL | What it does | Node equivalent |
|---|---|---|
| `mix(a, b, t)` | blend a→b by t | *Mix* (Blender), *Lerp* (Unreal) |
| `clamp(x, 0, 1)` | keep x inside a range | *Clamp*, *Saturate* |
| `smoothstep(e0, e1, x)` | soft 0→1 ramp between e0 and e1 | *Map Range* (smoothstep), *SmoothStep* |
| `step(edge, x)` | hard 0 or 1 | *Math > Greater Than* |
| `fract(x)` | keep only the decimals (repeats 0→1) | *Math > Fraction*, *Frac* |
| `dot(a, b)` | how much two directions agree (-1..1) | *Vector Math > Dot Product* |
| `normalize(v)` | make a direction length 1 | *Normalize* |
| `reflect(i, n)` | mirror a direction around a normal | *Reflection Vector* |
| `dFdx`, `fwidth` | how fast a value changes between neighbouring pixels | *DDX / DDY* (Unreal) |

### Spaces: object, world, view, screen

A position can be measured from different origins, as in Blender's *Texture Coordinate* node (Object vs. Generated vs. Camera):

- **Object space** (`position`): relative to the object's own origin. It *sticks to the mesh* when the mesh spins. Dissolve uses this so the burn pattern does not slide over the surface.
- **World space** (`modelMatrix * position`): relative to the scene origin. Hologram scanlines use this, so the lines stay level while the object rotates under them.
- **View space** (`modelViewMatrix * position`): relative to the camera. Matcap uses this.
- **Clip/screen space** (`gl_Position`): where it lands on the screen. The vertex shader must output this.

Three.js gives every shader these **matrices** (transforms) for free: `modelMatrix`, `viewMatrix`, `projectionMatrix`, `modelViewMatrix`, `normalMatrix`, plus `cameraPosition`.

### Attributes, uniforms and varyings

These are the three kinds of input a shader gets. They are the most important idea in this guide.

**Attributes** are per-vertex data stored in the mesh: `position`, `normal`, `uv`. Blender shows the same data in its spreadsheet editor.

**Uniforms** are values that are the **same for every vertex and pixel** in one draw, and that you can change from outside the shader at any time. They are the equivalent of:

- Unreal: **Material Instance parameters** (Scalar Parameter, Vector Parameter, Texture Parameter)
- Blender: an input socket on a node group that you tweak from the material panel

```glsl
uniform float uEdgeWidth;  // a slider
uniform vec3  uEdgeColor;  // a colour picker
uniform sampler2D tMatcap; // a texture
```

Every slider in this app's control panel writes directly into a uniform. Moving it doesn't recompile or rebuild anything. On the next frame the GPU reads the new number, so changes appear instantly. Time is a uniform too (`uTime`, `uPhase`), which is how everything animates.

> Naming convention used in this project: `uSomething` = uniform, `tSomething` = texture uniform, `vSomething` = varying. The code viewer colours them differently.

**Varyings** carry data **from the vertex shader to the fragment shader**. The vertex shader writes a value at each corner of a triangle, and the GPU **blends (interpolates)** those values across the triangle, so every pixel receives a smoothly mixed value. That is the "varying" part.

```glsl
// vertex shader
varying vec3 vWorldNormal;
vWorldNormal = normalize(mat3(modelMatrix) * normal);

// fragment shader
varying vec3 vWorldNormal;           // same name = same data
vec3 N = normalize(vWorldNormal);    // re-normalise: blending shortens vectors
```

In Unreal this is a *Vertex Interpolator* or *Customized UVs*. In Blender it happens automatically whenever a value computed per vertex reaches the surface shader.

### Normals and lighting

A **normal** is the direction a surface faces. Almost all lighting is built from `dot` products between normals and other directions:

- `N`: surface normal
- `L`: direction *to* the light
- `V`: direction *to* the camera (`normalize(cameraPosition - worldPos)`)
- `H`: the "half vector", `normalize(L + V)`

```glsl
float diffuse  = max(dot(N, L), 0.0);                    // Lambert: facing the light = bright
float specular = pow(max(dot(N, H), 0.0), shininess);    // Blinn-Phong highlight
```

These shaders don't use three.js's lights. Each shader hard-codes its own light directions, which is simpler and easier to read.

### Fresnel

Look at a lake: straight down you see *into* the water; towards the horizon it turns into a mirror. Look at a ball's silhouette: the edges look brighter than the middle. That effect is **Fresnel**: surfaces seen edge-on reflect more.

In code it is one `dot` product. Facing you, `dot(N, V) = 1`. Edge-on, `dot(N, V) = 0`.

```glsl
float rim = pow(1.0 - dot(N, V), power);   // 0 in the middle, 1 at the edges
```

That's the *Layer Weight > Facing* / *Fresnel* node in Blender and the *Fresnel* node in Unreal. Two versions live in `sl_common`:

- `fresnelRim(N, V, power)`: the artistic version, with a power that controls rim thickness. Used by hologram, force field, toon and wave.
- `fresnelSchlick(cosTheta, f0)`: the physically based version. `f0` is the reflectance when looking straight on (about 0.02 for water, 0.04 for glass). Used by water, metal and bubble.

### Noise

Real materials are never perfectly smooth. **Noise** is a function that turns any position into a random-looking but **smooth** value. The same input always gives the same output, and nearby inputs give similar outputs. It is the Blender *Noise Texture* node, written by hand.

This project uses **3D simplex noise** (`snoise` in `sl_noise`). Feed it a 3D point and you get a value around -1..1. Then:

- **Scale** the input to change the size of the blobs: `snoise(p * 4.0)` gives smaller blobs.
- **Offset** the input to animate it: `snoise(p + time)`.
- **Layer** several copies at doubling frequency and halving strength. That's **fBm** (fractal Brownian motion), the *Detail* slider on Blender's Noise Texture:

```glsl
float fbm(vec3 p, int octaves) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < octaves; i++) {
    sum += amp * snoise(p);
    p *= 2.02;   // twice as detailed
    amp *= 0.5;  // half as strong
  }
  return sum;
}
```

- **Ridged noise** uses `1.0 - abs(noise)`, which folds the valleys into sharp crests. It's good for mountains (terrain effect).
- **Hash** functions (`hash11`, `hash21`) are noise without smoothness: pure random per input. They're used for flicker and per-cell randomness.

### Time and perfect loops

The **Record 5s loop** button exports seamless loops because every effect follows one rule: *all motion repeats exactly every 5 seconds*.

- `uPhase` goes 0→1 over 5 seconds, then wraps.
- Sine waves use **whole numbers** of cycles per loop: `sin(uPhase * TAU * 2.0)`. That's why many "speed" sliders snap to integers.
- Noise is animated by moving the lookup point **around a circle** with `loopCircle(radius)`. After one loop it is back where it started, so the noise is too.
- Heat haze needs noise that keeps *rising*, which a circle can't do. It uses the **flow-map trick**: two copies scroll upward half a cycle apart, and each fades out right before it jumps back.

### Blending and transparency

- **Opaque** (default): the pixel replaces what's behind it.
- **Alpha blending** (`transparent: true`): mixes with what's behind by alpha. Used by the soap bubble.
- **Additive** (`blending: AdditiveBlending`): *adds* light on top. Black becomes invisible and colours glow. Used by hologram and force field. It matches the *Additive* blend mode in Unreal.
- **`discard`** throws a pixel away entirely, like Unreal's *Opacity Mask* or Blender's *Alpha Clip*. Used by dissolve.

### Render targets and post-processing

Normally the GPU draws straight to the screen. A **render target** is an invisible image you draw into instead, like Unreal's *Render Target* + *Scene Capture*. Then a **post-process** shader draws one rectangle covering the whole screen and, for each pixel, reads the render target with `texture2D(tScene, uv)`. Change *where* you read and you get distortion (heat haze). Change *what you do* with the colour and you get stylisation (pixelate). It's the compositor in Blender, or a *Post Process Material* in Unreal.

### Colour space, in one paragraph

Lighting maths must happen in **linear** colour, where 2× the number means 2× the light. Screens and colour pickers use **sRGB**, which is curved to match our eyes. Three.js converts colour-picker values to linear when they go into a uniform. Each fragment shader ends with `#include <colorspace_fragment>`, which converts the result back to sRGB for the screen. Blender's *Filmic/Standard view transform* does the same job.

---

### How each effect works

Each heading names the file in `src/effects/`. The step comments in the GLSL match the numbers below.

#### 01 · Dissolve (`dissolve.js`)
1. Sample **fBm noise** at the object-space position, giving each point a value 0..1.
2. Compare it with a **threshold** that rises from 0 to 1 with `progress`.
3. Points below the threshold are thrown away with **`discard`**, which makes the holes.
4. Points just *above* the threshold (within `uEdgeWidth`) are the **burning edge**. They get an emissive colour that is whiter at the very edge.
5. A darker "scorch" band sits just behind the glow.
6. `uSweep` blends the noise with height, so the burn moves upward instead of appearing randomly.

Unreal equivalent: an Opacity Mask driven by noise minus a scalar parameter, with emissive at the edge.

#### 02 · Hologram (`hologram.js`)
1. **Fresnel rim**: edges glow and the centre stays see-through.
2. **Scanlines**: `sin(worldY * density - time)` sharpened with `smoothstep` into thin lines, in world space so they stay horizontal.
3. A wide **bright band** sweeps upward once per loop.
4. **Flicker**: a random brightness per time step (`hash11(floor(phase * 120))`).
5. **Additive blending**, so the result adds light like a projection.
6. In the **vertex shader**, a random thin horizontal slice sometimes jumps sideways: the **glitch**.

#### 03 · Toon (`toon.js`)
Two meshes share the same uniforms:
1. **Outline (inverted hull)**: a copy of the mesh whose vertices are pushed outward along their normal, drawn with **only back faces** (`side: BackSide`). The front of the real mesh hides most of it, so only a rim peeks out around the silhouette. Blender users know this trick as *Solidify modifier + flipped normals*. The push is done in screen space, so the line stays the same pixel width at any distance.
2. **Cel shading**: compute normal lighting `dot(N, L)`, then **quantise** it into `uBands` flat steps. `fwidth` anti-aliases the step edges.
3. A hard-edged specular dot and an anime-style rim light finish it.

#### 04 · Water (`water.js`)
1. **Vertex shader**: add several **sine waves** travelling in different directions, plus a little noise, and move each vertex along its normal by that height.
2. Moving vertices breaks their normals, so `sl_displace` **rebuilds the normal**. It displaces two tiny neighbouring points as well and takes the cross product of the edges, like "recalculate normals" after a modifier.
3. **Fragment shader**: tiny ripple detail tilts the normal using the slope of a noise field.
4. **Fresnel (Schlick)** blends the water's body colour (looking down into it) with a **sky reflection** (at grazing angles).
5. A sharp **sun glint** is added to the reflection, and **foam** appears on the highest crests.

#### 05 · Force Field (`forcefield.js`)
The most "engine-like" effect. It needs the scene's **depth**: how far away every pixel's surface is.
1. **Pass A**: the stage renders the scene *without* the shield into a render target with a **depth texture**.
2. **Pass B**: the shield's fragment shader reads that depth at its own screen pixel (`gl_FragCoord.xy / uResolution`) and converts it back to a distance with `perspectiveDepthToViewZ`.
3. If the shield's own distance is **almost equal** to the scene distance behind it, something is touching the shield, so that area glows. This is Unreal's **DepthFade** / *SceneDepth − PixelDepth* trick.
4. Layers are added on top: Fresnel rim, a **hexagon grid** drawn from UVs, per-cell shimmer and an expanding **impact ripple**.
5. Additive blending makes it glow. The orbiting cubes and the floor are there so you can see the intersection lines.

#### 06 · Brushed Metal (`metal.js`)
1. Brushed metal reflects light in a **stretched streak**, because tiny parallel grooves scatter light in only one direction. To know "which direction", we need a **tangent** (T). It's built from screen-space derivatives (`dFdx`/`dFdy`) of the position and UVs, which works on any mesh without stored tangents.
2. **Ward anisotropic** specular: a Gaussian highlight with two roughness values, one *along* the brush and one *across* it. Different values give the stretched highlight. This is Blender Principled BSDF's *Anisotropic* setting.
3. **Scratches**: noise stretched hugely in one direction tilts the tangent frame slightly, which breaks the highlight into streaks.
4. A fake **studio environment** (gradient + two softboxes) is reflected. Metals tint reflections with their own colour and have no diffuse.

#### 07 · Soap Bubble (`bubble.js`)
1. A soap film is a few hundred **nanometres** thick. Light bounces off its front *and* back surfaces. The back bounce travels an extra `2 · n · thickness · cos(angle)`.
2. For each colour's **wavelength** (red 650 nm, green 510 nm, blue 475 nm), that extra distance either lines the two waves up (bright) or cancels them (dark). Different colours cancel at different thicknesses and angles, which produces the rainbow swirls. This is **thin-film interference**, real physics in a few lines.
3. Thickness varies with **swirling noise**, and gravity drains the top thinner.
4. Fresnel controls transparency: clear in the middle, reflective at the rim. Two bright "window" reflections sell the glassy look.

#### 08 · Vertex Waves (`wave.js`)
All the motion is in the **vertex shader**:
1. **Twist**: rotate each vertex around Y by an angle that depends on its height (Blender's *Simple Deform > Twist*).
2. **Displace** along the normal by travelling sine waves mixed with noise.
3. **Rebuild normals** with `sl_displace` so lighting follows the new shape.
4. Pass the displacement amount to the fragment shader as a **varying**, which colours troughs and peaks differently.

#### 09 · Triplanar Terrain (`terrain.js`)
1. **Ridged fBm noise** lifts vertices into mountains. Anything below sea level is clamped flat, which makes oceans.
2. A tileable rock/grass texture (generated in JavaScript) is applied with **triplanar mapping**: it is projected three times, along X, Y and Z, like three slide projectors. The three results are blended by how much the surface faces each axis (`abs(normal)` raised to a sharpness power). There are no UVs, so cliffs and the sphere's poles don't stretch. This is Unreal's *WorldAlignedTexture* and Blender's *Image Texture > Box* projection with *Blend*.
3. **Elevation and slope** pick the material: sand at the shore, grass on gentle slopes, rock on steep ones, snow on high peaks, water below sea level.
4. Toggle **Show blend weights** to see the three projections as red, green and blue.

#### 10 · Matcap (`matcap.js`)
1. A **matcap** ("material capture") is a *picture of a lit sphere*. Blender's viewport *MatCap* shading does exactly this.
2. Every point on a sphere has a unique normal, so we can find the sphere pixel whose normal matches our surface normal **as seen from the camera** and copy its colour.
3. In code, the view-space normal's X and Y (-1..1) become a texture coordinate (0..1). A small correction keeps the edges right in a wide-angle view.
4. The matcap images are **baked in JavaScript** (`textures.js`) by shading a virtual sphere pixel by pixel. The *Bumps* slider tilts the normals with noise to show that matcaps react to surface detail.

#### 11 · Heat Haze (`heathaze.js`, post-process)
1. The scene renders into a **render target** instead of the screen.
2. A full-screen shader reads it at a slightly **shifted UV**. The shift comes from 2D noise that **rises** (flow-map trick, see *Time and perfect loops*).
3. A **mask** keeps the distortion strongest at the bottom of the frame and fades it upward.
4. Red, green and blue are read with slightly different shifts: **chromatic aberration**.
5. Toggle **Show mask + noise** to see the hidden data.

#### 12 · Pixelate (`pixelate.js`, post-process)
1. Divide the screen into big **cells** and make every pixel in a cell read the colour at the cell's **centre**, which gives blocky pixels.
2. **Quantise**: round each colour channel to a few levels. This is done in gamma space so the steps are spread the way our eyes see brightness.
3. **Ordered (Bayer) dithering**: before rounding, add a small offset from a repeating 4×4 pattern. Gradients turn into a neat cross-hatch instead of hard bands, as in old games and print.
4. Optional **palettes** (handheld green, 1-bit) map brightness to a tiny set of colours, and an optional **LCD grid** darkens cell borders.

---

## Part 2: The code, file by file

### How a web app like this fits together

| Thing | What it is | Analogy |
|---|---|---|
| **HTML** (`index.html`) | The page's structure: buttons, panels, the canvas | The UI layout of an editor |
| **CSS** (`src/style.css`) | How things look: colours, spacing, layout on phones | A theme/style sheet |
| **JavaScript** (`src/*.js`) | Behaviour: what happens on click, the render loop | Blueprints / Python scripts |
| **Three.js** | A 3D library for the browser: cameras, meshes, the renderer | The engine's renderer |
| **WebGL** | The browser's low-level GPU access that three.js uses | DirectX / Vulkan / OpenGL |
| **Vite** | Dev server and "build" tool that packages files for the web | The *Package Project* button |
| **npm** | Downloads libraries (three, vite) into `node_modules/` | A plugin/asset store |

### Running it

```bash
npm install
```

```bash
npm run dev
```

Then open the address it prints (usually `http://localhost:5173`). Edit any shader, save, and the page reloads.

```bash
npm run build
```

`build` writes an optimised website into `dist/`. **Deploying to Vercel**: push the repo to GitHub, import it at vercel.com, and Vercel reads `vercel.json` (build command `npm run build`, output folder `dist`). No other setup is needed.

### Project map

```
index.html              page layout: top bar, gallery, viewport, panel
vite.config.js          build settings (splits three.js into its own cached file)
vercel.json             deploy settings for Vercel
public/favicon.svg      browser tab icon
src/
  main.js               connects the interface to the 3D stage
  stage.js              renderer, camera, object, render passes
  style.css             all visual styling, including the phone layout
  shaders/
    chunks.js           shared GLSL: noise, fresnel, loop helpers, displacement
    props.js            background, grid floor, cubes, backdrop, showcase material
    textures.js         generates matcap and terrain textures with code
  effects/
    index.js            list of the 12 effects, in gallery order
    common.js           a shared, simple vertex shader
    post-common.js      full-screen vertex shader + shared bits for post effects
    dissolve.js … pixelate.js   one file per effect
  ui/
    controls.js         builds sliders / colour pickers / toggles from uniforms
    codeview.js         the "Shader code" tab
    highlight.js        colours GLSL code (syntax highlighting)
    recorder.js         records the canvas to a WebM video
```

### `src/effects/*.js`: what an effect looks like

Every effect is one plain JavaScript object, a recipe the rest of the app knows how to cook:

```js
export default {
  id: 'dissolve',                 // used in the URL: /#dissolve
  name: 'Dissolve',
  tagline: 'Noise threshold with a glowing burn edge',
  steps: ['…', '…'],              // the "How it works" list in the panel

  uniforms: () => ({              // starting values of every knob
    uEdgeWidth: { value: 0.06 },
    uEdgeColor: { value: new Color('#ff6a00') },
  }),

  controls: [                     // how each knob appears in the panel
    { uniform: 'uEdgeWidth', type: 'range', label: 'Edge width', min: 0.005, max: 0.25, step: 0.005 },
    { uniform: 'uEdgeColor', type: 'color', label: 'Edge colour' },
  ],

  layers: [                       // one mesh per layer, each with its own shaders
    { name: 'Surface', vertexShader, fragmentShader, options: { side: DoubleSide } },
  ],

  post: { … },                    // optional: full-screen post-process shader
  props: (globals) => [ … ],      // optional: extra scene objects (floor, cubes)
  needsDepth: true,               // optional: run the depth pre-pass (force field)
};
```

- **`uniforms`** is a *function* that returns fresh values. The **Reset** button calls it again to get the defaults back.
- Uniforms are objects shaped like `{ value: … }`. Three.js reads `.value` every frame, so changing it updates the shader. This is the exact link between sliders and the GPU.
- **`layers`**: most effects have one. Toon has two (Outline, then Surface), which is how the inverted-hull outline is drawn.
- Shaders are written as **template strings**: text between backticks `` ` ``. The `/* glsl */` comment before them only tells code editors to colour the text as GLSL.

To **add your own effect**: copy an effect file, rename the `id`, change the shaders, and add it to the list in `effects/index.js`. The gallery, panel, code viewer and recorder pick it up automatically.

### `src/shaders/chunks.js`: shared GLSL

Several effects need the same noise or Fresnel code. Rather than copy-pasting, this file stores snippets in `THREE.ShaderChunk`. When a shader contains `#include <sl_noise>`, three.js pastes that snippet in before compiling. This is like a *Material Function* in Unreal or a node group in Blender.

- **`sl_common`**: the global uniforms (`uTime`, `uPhase`, `uResolution`, `uPixelRatio`), `PI`/`TAU`, the loop helpers `loopSin` and `loopCircle`, the random `hash` functions and both Fresnel functions.
- **`sl_noise`**: 3D simplex noise and `fbm`.
- **`sl_displace`**: `displaceSurface()`, which moves a vertex along its normal *and* recomputes the normal. The including shader must define `float displacement(vec3 p)`. GLSL can't pass functions around, so this "define it first, then include" pattern stands in.
- **`LOOP_SECONDS = 5`**: the loop length, used by the stage and the recorder.

In the **Shader code** tab, the `<sl_…>` chips show these chunks.

### `src/stage.js`: the 3D engine room

`Stage` is a class: a bundle of data plus functions that act on it. It owns:

- **`renderer`**: three.js's `WebGLRenderer`, which draws into the `<canvas>`.
- **`camera`** + **`controls`**: a perspective camera and `OrbitControls` (drag to orbit, scroll to zoom), like the viewport navigation in Blender.
- **`globals`**: the uniforms every shader shares (time, phase, resolution). The *same* `{ value }` objects are handed to every material, so updating one place updates every shader.
- **`tilt` → `turntable` → meshes**: a small hierarchy, like parenting empties in Blender. The turntable spins once per loop. The tilt leans the plane toward the camera.
- **`GEOMETRIES`**: Sphere, Torus knot and Plane, with lots of vertices so vertex displacement looks smooth.

Key functions:

- **`getRuntime(effect)`** builds an effect the first time it is shown: it creates a `ShaderMaterial` per layer (a material built from *our* GLSL, with no stock materials anywhere), a `Mesh` per layer, the post material and the props. The result is cached, so switching back is instant and your slider tweaks are kept.
- **`setEffect(effect)`** removes the old meshes/props from the scene and adds the new ones.
- **`setGeometry(name)`** swaps the shape under the current effect.
- **`update(dt)`** runs every frame: advance the clock, spin the turntable, then `renderFrame()`.
- **`setTime(seconds)`** wraps time to the 5-second loop and sets `uTime`/`uPhase`.
- **`renderFrame()`** is the render pipeline:
  1. *Force field only:* hide the shield, render the scene into `depthTarget`, then show the shield and pass the depth texture to it.
  2. *Post effects:* render the scene into `sceneTarget` (a texture), then draw the full-screen quad with the post shader to the screen.
  3. *Everything else:* render the scene straight to the screen.
- **`thumbnail(effect)`** temporarily switches effect, renders a tiny frame, saves it as an image (`toDataURL`) for the gallery card, then restores everything.
- **`resize()`** keeps the canvas's real pixel count matched to its on-screen size × the screen's pixel density, so it stays sharp on phones.

### `src/shaders/props.js`: set dressing

These are hand-written shaders for the supporting objects:

- **Background**: a 2×2 plane placed directly in screen space (no camera maths), drawing a soft radial gradient with a tiny noise **dither** to hide colour banding.
- **Grid floor**: anti-aliased lines using `fwidth`, fading out in a circle.
- **Orbiters**: three cubes whose `update(phase)` moves them in a loop, used by the force field.
- **Backdrop**: a huge sphere seen from inside (`BackSide`) with a latitude/longitude grid, so post effects have detail to distort.
- **Showcase material**: colourful lit stripes used on the object under the post effects.

### `src/shaders/textures.js`: images made with code

There are no image files in this project. This file draws pixels into an HTML `<canvas>` and gives it to three.js as a texture:

- **Matcaps**: for each pixel of a circle, it works out the sphere's normal there, lights it (diffuse + specular + rim, plus a fake horizon for chrome and gold) and writes the colour. That's a tiny offline renderer, i.e. baking.
- **Detail texture**: tileable value noise (it wraps around, so the edges match) for the terrain's triplanar rock and grass detail.

Note `colorSpace`: matcaps are pictures (sRGB). The detail texture is *data* (no colour conversion).

### `src/main.js`: wiring it all together

This file runs first. In order, it:

1. Creates the `Stage`, or shows a message if WebGL isn't available.
2. Builds the **geometry buttons** from `GEOMETRIES`.
3. Builds a **gallery card** for each effect.
4. Defines **`selectEffect()`**, which tells the stage to switch, highlights the card, updates the title, rebuilds the controls panel and code view, and writes `#id` into the URL so links can open a specific effect.
5. Hooks up the **tabs**, the **turntable** and **pause** buttons and the **record** button (see below).
6. Adds **keyboard shortcuts**: ←/→ change effect, Space pauses, T toggles the turntable.
7. Uses a **ResizeObserver** to resize the renderer whenever the viewport box changes size (window resize, phone rotation).
8. Starts the **render loop**: `requestAnimationFrame(loop)` asks the browser to call `loop` before every screen refresh, about 60 times a second. Each call renders one frame. The first frames also render one gallery thumbnail each.

### `src/ui/controls.js`: the control panel

`buildControls()` reads the effect's `controls` list and creates the matching HTML input for each:

- `range` gives a **slider**. On `input` it sets `uniform.value = number`.
- `color` gives a **colour picker**. It calls `uniform.value.set('#ff6a00')`, and three.js's `Color` converts sRGB to linear.
- `toggle` gives a **switch**, sending `1.0` or `0.0`. Shaders read it as a float (`if (uAuto > 0.5)`), which works on every GPU.
- `select` gives a **dropdown**, which can hold any value, even a texture (the matcap picker).

There's no framework. It's plain DOM code: `document.createElement`, `addEventListener`.

### `src/ui/codeview.js` and `src/ui/highlight.js`: the code tab

- **codeview** lists the effect's programs (e.g. *Outline* / *Surface*, or *Object* / *Post-process*), the **Vertex** / **Fragment** stage, and a chip for every `#include` it finds, so you can read the shared chunks too. **Copy** puts the source on your clipboard.
- **highlight** is a small syntax colourer. One big regular expression (a text-matching pattern) finds comments, numbers, keywords, types, built-in functions and our `u…`/`v…` names, then wraps each in a `<span>` with a CSS class. CSS counters draw the line numbers.

### `src/ui/recorder.js`: exporting a video

1. `canvas.captureStream(60)` turns the canvas into a live 60 fps video track, like a screen recorder pointed at just the canvas.
2. **`MediaRecorder`** (built into browsers) encodes it as **WebM** (VP9 or VP8). Safari can't make WebM, so it falls back to MP4 and says so.
3. Just before recording, time is **rewound to the start of the loop**. Recording stops after exactly 5 seconds. Every effect repeats every 5 seconds, so the video loops seamlessly.
4. The collected data becomes a `Blob` (a file in memory), and `download()` saves it as `shader-lab-<effect>.webm`.

Tip: set the turntable and camera the way you like, then press Record. Your slider settings are recorded too.

### `src/style.css`: the look and the phone layout

- **Design tokens** at the top (`--bg`, `--accent`, `--text-2`…) hold the colours in one place, like a shared material parameter collection.
- **Desktop**: a three-column **CSS grid**: gallery | viewport | panel.
- **Under 900 px wide** (phones, small tablets): the page stacks: top bar, viewport, a horizontally scrolling gallery strip, then the panel.
- Custom-styled sliders, switches and colour swatches; `prefers-reduced-motion` turns UI animation off for people who ask their OS for less motion.

### `index.html`, `vite.config.js`, `vercel.json`

- **index.html** is the skeleton: top bar (geometry switch, turntable, pause, record), `<nav>` gallery, `<canvas>` viewport, and the panel with its two tabs. `<script type="module" src="/src/main.js">` loads the app.
- **vite.config.js** puts three.js in its own file, so returning visitors' browsers can reuse a cached copy.
- **vercel.json** sets the build command and output folder for Vercel, and tells browsers they can cache built assets forever. Vite gives them unique names on every build, so this is safe.

---

## Where to go next

- Change a number in a shader, save, and watch the result. That's the fastest way to learn.
- Try copying `dissolve.js` to a new effect that uses `fresnelRim` as the dissolve field, so it burns from the edges inward.
- Read [The Book of Shaders](https://thebookofshaders.com) for noise and patterns, and [Inigo Quilez's articles](https://iquilezles.org/articles/) for the maths behind many of these tricks.
