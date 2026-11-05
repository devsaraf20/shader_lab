# Shader Lab

A web playground of **12 hand-written GLSL shader effects** built with Vite and Three.js. Every material is a `ShaderMaterial` written by hand; there are no stock three.js materials.

**Effects:** dissolve with glowing edge · hologram with scanlines · toon with outline · animated water with Fresnel · force field with intersection glow · brushed anisotropic metal · iridescent soap bubble · vertex wave distortion · triplanar noise terrain · matcap · heat haze (post) · pixelate (post)

## Features

- Switch the object between a sphere, a torus knot and a plane.
- A live control panel (sliders, colour pickers, toggles, dropdowns) is generated from each effect's uniforms.
- The **Shader code** tab shows syntax-highlighted vertex and fragment shaders, plus the shared `#include` chunks, with step-by-step comments.
- The **Record 5s loop** button exports a seamless WebM. Every effect repeats exactly every 5 seconds. Safari falls back to MP4.
- Dark, responsive UI that works on phones. Keyboard shortcuts: ←/→ change effect, Space pauses, T toggles the turntable.
- Each effect has a deep link, e.g. `/#forcefield`.

## Develop

```bash
npm install
npm run dev
```

## Build / deploy

```bash
npm run build
```

`npm run build` outputs a static site to `dist/`. To deploy, import the repo in Vercel. `vercel.json` already sets the build command and output directory.

## Learn

Read [LEARN.md](./LEARN.md). It covers uniforms, varyings, Fresnel and noise, how each effect works, and a file-by-file walkthrough of the code, written for designers coming from Blender or Unreal.
