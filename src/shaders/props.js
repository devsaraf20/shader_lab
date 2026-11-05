// -----------------------------------------------------------------------------
// Supporting "set dressing": the background gradient, a grid floor, orbiting
// cubes and a simple showcase material used under the post-process effects.
// Every one of these is also a hand-written ShaderMaterial.
// -----------------------------------------------------------------------------
import {
  BackSide, BoxGeometry, Color, Group, Mesh, PlaneGeometry, ShaderMaterial, SphereGeometry,
} from 'three';
import { LOOP_SECONDS } from './chunks.js';

// ---- Background: a full-screen quad drawn behind everything ----
export function createBackground(globals) {
  const material = new ShaderMaterial({
    uniforms: {
      ...globals,
      uTop: { value: new Color('#171b26') },
      uBottom: { value: new Color('#06070a') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // Skip the camera entirely: the 2x2 plane already spans clip space -1..1
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      #include <sl_common>
      uniform vec3 uTop;
      uniform vec3 uBottom;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - vec2(0.5, 0.55);
        p.x *= uResolution.x / uResolution.y;          // keep the glow round
        float glow = 1.0 - smoothstep(0.0, 0.9, length(p));
        vec3 col = mix(uBottom, uTop, glow);
        // tiny noise "dither" hides 8-bit banding in dark gradients
        col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const geo = new PlaneGeometry(2, 2);
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

// ---- Grid floor ----
const floorShader = {
  vertexShader: /* glsl */ `
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    #include <sl_common>
    uniform vec3 uColor;
    uniform vec3 uLineColor;
    varying vec3 vWorldPos;
    // Anti-aliased grid line: fwidth = how much the value changes per pixel
    float gridLine(vec2 p, float spacing) {
      vec2 g = abs(fract(p / spacing - 0.5) - 0.5) / fwidth(p / spacing);
      return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main() {
      float minor = gridLine(vWorldPos.xz, 0.25) * 0.35;
      float major = gridLine(vWorldPos.xz, 1.0);
      float fade = 1.0 - smoothstep(1.5, 5.0, length(vWorldPos.xz)); // circular falloff
      vec3 col = uColor + uLineColor * max(minor, major);
      gl_FragColor = vec4(col, fade);
      #include <colorspace_fragment>
    }`,
};

export function createFloor(globals, y = -1.1, size = 12) {
  const material = new ShaderMaterial({
    uniforms: {
      ...globals,
      uColor: { value: new Color('#0d1017') },
      uLineColor: { value: new Color('#3b4766') },
    },
    ...floorShader,
    transparent: true,
  });
  const mesh = new Mesh(new PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

// ---- A simple lit solid colour, used for props ----
const solidShader = {
  vertexShader: /* glsl */ `
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    void main() {
      vec3 N = normalize(vWorldNormal);
      vec3 L = normalize(vec3(0.5, 0.9, 0.4));
      float light = max(dot(N, L), 0.0) * 0.8 + 0.2;  // diffuse + ambient
      gl_FragColor = vec4(uColor * light, 1.0);
      #include <colorspace_fragment>
    }`,
};

// Cubes that orbit through the force field so its intersection glow shows up.
export function createOrbiters(globals) {
  const group = new Group();
  const colors = ['#ff7a59', '#ffd166', '#7bdff2'];
  const cubes = colors.map((c, i) => {
    const mesh = new Mesh(
      new BoxGeometry(0.28, 0.28, 0.28),
      new ShaderMaterial({ uniforms: { uColor: { value: new Color(c) } }, ...solidShader }),
    );
    mesh.userData.offset = i / colors.length;
    mesh.userData.height = [-0.15, 0.25, 0.55][i];
    group.add(mesh);
    return mesh;
  });
  // Called every frame with the loop phase (0..1) so the orbit loops too.
  group.userData.update = (phase) => {
    for (const cube of cubes) {
      const a = (phase + cube.userData.offset) * Math.PI * 2;
      const r = 1.05 + 0.12 * Math.sin(a * 2);
      cube.position.set(Math.cos(a) * r, cube.userData.height, Math.sin(a) * r);
      cube.rotation.set(a, a * 2, 0);
    }
  };
  return group;
}

// ---- Backdrop: big inside-out sphere with a lat/long grid ----
// Gives the post-processing effects something detailed to distort.
export function createBackdrop(globals) {
  const material = new ShaderMaterial({
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      #include <sl_common>
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        // turn the direction into longitude/latitude, then draw lines
        vec2 ll = vec2(atan(d.z, d.x) / TAU * 36.0, asin(d.y) / PI * 18.0);
        vec2 g = abs(fract(ll - 0.5) - 0.5) / fwidth(ll);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float horizon = exp(-abs(d.y) * 6.0);           // bright band at eye level
        vec3 col = mix(vec3(0.02, 0.025, 0.04), vec3(0.09, 0.07, 0.16), d.y * 0.5 + 0.5);
        col += vec3(1.0, 0.45, 0.25) * horizon * 0.35;
        col += vec3(0.35, 0.45, 0.8) * line * 0.35;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: BackSide,
    depthWrite: false,
  });
  const mesh = new Mesh(new SphereGeometry(14, 64, 32), material);
  mesh.renderOrder = -500;
  return mesh;
}

// ---- Showcase material: colourful lit stripes, used under post effects ----
export const showcaseShader = {
  vertexShader: /* glsl */ `
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    #include <sl_common>
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    void main() {
      vec3 N = normalize(vWorldNormal);
      if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(cameraPosition - vWorldPos);
      vec3 L = normalize(vec3(-0.4, 0.8, 0.6));
      // 1. pattern: diagonal stripes + checker, so distortion is easy to see
      float stripes = step(0.5, fract((vUv.x * 8.0 + vUv.y * 4.0)));
      float checker = mod(floor(vUv.x * 16.0) + floor(vUv.y * 8.0), 2.0);
      vec3 albedo = mix(uColorA, uColorB, stripes) * (0.8 + 0.2 * checker);
      // 2. lighting: wrap diffuse + Blinn-Phong highlight + rim
      float diff = max(dot(N, L) * 0.7 + 0.3, 0.0);
      float spec = pow(max(dot(N, normalize(L + V)), 0.0), 64.0);
      float rim = fresnelRim(N, V, 3.0);
      vec3 col = albedo * diff + spec * 0.6 + rim * vec3(0.4, 0.6, 1.0) * 0.6;
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
};

export const showcaseUniforms = () => ({
  uColorA: { value: new Color('#ff5d73') },
  uColorB: { value: new Color('#ffd23f') },
});

export { LOOP_SECONDS };
