// -----------------------------------------------------------------------------
// The Stage owns everything three.js: renderer, camera, the object, and the
// render pipeline (normal, depth pre-pass, or render-to-texture + post).
// Think of it as the viewport + render settings of a 3D app.
// -----------------------------------------------------------------------------
import {
  DepthTexture, Group, HalfFloatType, Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry,
  Scene, ShaderMaterial, SphereGeometry, TorusKnotGeometry, Vector2, WebGLRenderer, WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LOOP_SECONDS } from './shaders/chunks.js';
import { createBackground } from './shaders/props.js';

const TAU = Math.PI * 2;

export const GEOMETRIES = {
  sphere: { label: 'Sphere', tilt: 0, build: () => new SphereGeometry(1, 256, 128) },
  knot: { label: 'Torus knot', tilt: 0, build: () => new TorusKnotGeometry(0.62, 0.24, 512, 64) },
  plane: {
    label: 'Plane',
    tilt: 0.55, // lean the plane toward the camera so you see its top
    build: () => new PlaneGeometry(2.4, 2.4, 256, 256).rotateX(-Math.PI / 2),
  },
};

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x06070a, 1);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(38, 1, 0.1, 60);
    this.camera.position.set(0, 0.45, 4.4);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 9;

    // Uniforms every shader shares. The same { value } objects are handed to
    // every material, so updating them here updates every shader at once.
    this.globals = {
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uResolution: { value: new Vector2(1, 1) },
      uPixelRatio: { value: this.pixelRatio },
    };

    this.scene.add(createBackground(this.globals));

    // tilt -> turntable -> meshes. The turntable spins around the tilted axis.
    this.tilt = new Group();
    this.turntable = new Group();
    this.tilt.add(this.turntable);
    this.scene.add(this.tilt);

    this.geometryCache = {};
    this.geometryName = 'sphere';

    // Off-screen targets: one to render the scene into a texture (for post
    // effects), one to capture depth (for the force field).
    this.sceneTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.depthTarget = new WebGLRenderTarget(1, 1);
    this.depthTarget.depthTexture = new DepthTexture(1, 1);

    // A tiny scene holding just one full-screen quad, for the post pass.
    this.postScene = new Scene();
    this.postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postQuad = new Mesh(new PlaneGeometry(2, 2));
    this.postQuad.frustumCulled = false;
    this.postScene.add(this.postQuad);

    this.runtimes = new Map();
    this.current = null;

    // Animation clock
    this.elapsed = 0;
    this.paused = false;
    this.spin = true;
    this.spinOffset = 0;
    this.angle = 0;
    this.size = { width: 1, height: 1 };
  }

  get geometry() {
    if (!this.geometryCache[this.geometryName]) {
      this.geometryCache[this.geometryName] = GEOMETRIES[this.geometryName].build();
    }
    return this.geometryCache[this.geometryName];
  }

  // Build (once) the materials, meshes and props for an effect.
  getRuntime(effect) {
    if (this.runtimes.has(effect.id)) return this.runtimes.get(effect.id);
    const own = effect.uniforms();
    // Spread copies the *references* to each { value } object, so globals stay live.
    const uniforms = { ...this.globals, ...own };
    const meshes = effect.layers.map((layer, i) => {
      const material = new ShaderMaterial({
        uniforms,
        vertexShader: layer.vertexShader,
        fragmentShader: layer.fragmentShader,
        ...(layer.options || {}),
      });
      const mesh = new Mesh(this.geometry, material);
      mesh.renderOrder = i; // draw layers in the order they are listed
      return mesh;
    });
    const post = effect.post
      ? new ShaderMaterial({
        uniforms,
        vertexShader: effect.post.vertexShader,
        fragmentShader: effect.post.fragmentShader,
        depthTest: false,
        depthWrite: false,
      })
      : null;
    const props = effect.props ? effect.props(this.globals) : [];
    const runtime = { effect, uniforms, meshes, post, props };
    this.runtimes.set(effect.id, runtime);
    return runtime;
  }

  setEffect(effect) {
    const next = this.getRuntime(effect);
    if (this.current === next) return next;
    if (this.current) {
      this.current.meshes.forEach((m) => this.turntable.remove(m));
      this.current.props.forEach((p) => this.scene.remove(p));
    }
    next.meshes.forEach((m) => {
      m.geometry = this.geometry;
      this.turntable.add(m);
    });
    next.props.forEach((p) => this.scene.add(p));
    this.current = next;
    return next;
  }

  setGeometry(name) {
    this.geometryName = name;
    this.tilt.rotation.x = GEOMETRIES[name].tilt;
    if (this.current) this.current.meshes.forEach((m) => (m.geometry = this.geometry));
  }

  // Restore an effect's uniforms to their starting values.
  resetUniforms(effect) {
    const runtime = this.getRuntime(effect);
    const fresh = effect.uniforms();
    for (const [key, u] of Object.entries(fresh)) {
      if (key.startsWith('t')) continue; // textures/targets are managed elsewhere
      const target = runtime.uniforms[key];
      if (target.value && target.value.copy) target.value.copy(u.value);
      else target.value = u.value;
    }
    // Selects that hold textures (e.g. matcap) go back to their first option.
    for (const c of effect.controls) {
      if (c.type === 'select') runtime.uniforms[c.uniform].value = fresh[c.uniform].value;
    }
  }

  setSpin(on) {
    if (on) this.spinOffset = this.angle - this.globals.uPhase.value * TAU; // no jump
    this.spin = on;
  }

  // Resize the drawing buffer. cssW/cssH are the on-screen size in CSS pixels.
  resize(cssW, cssH, pixelRatio = this.pixelRatio) {
    this.size = { width: cssW, height: cssH };
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(cssW, cssH, false); // false = leave CSS size alone
    const w = Math.max(1, Math.floor(cssW * pixelRatio));
    const h = Math.max(1, Math.floor(cssH * pixelRatio));
    this.sceneTarget.setSize(w, h);
    this.depthTarget.setSize(w, h);
    this.globals.uResolution.value.set(w, h);
    this.globals.uPixelRatio.value = pixelRatio;
    this.camera.aspect = cssW / cssH;
    this.camera.updateProjectionMatrix();
  }

  // Advance the clock and draw a frame.
  update(dt) {
    if (!this.paused) this.elapsed += dt;
    this.setTime(this.elapsed);
    if (this.spin) this.angle = this.globals.uPhase.value * TAU + this.spinOffset;
    this.turntable.rotation.y = this.angle;
    this.controls.update();
    this.renderFrame();
  }

  setTime(seconds) {
    // Wrap time every loop. Every effect is periodic, so this is seamless and
    // keeps numbers small (GPUs lose precision with big float values).
    const t = ((seconds % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
    this.globals.uTime.value = t;
    this.globals.uPhase.value = t / LOOP_SECONDS;
    for (const p of this.current?.props || []) p.userData.update?.(t / LOOP_SECONDS);
  }

  renderFrame() {
    const { renderer, scene, camera, current } = this;
    if (!current) return;
    const { effect, uniforms, meshes, post } = current;

    // Pass A (force field only): render the scene *without* the shield and
    // keep its depth buffer as a texture the shield can read.
    if (effect.needsDepth) {
      meshes.forEach((m) => (m.visible = false));
      renderer.setRenderTarget(this.depthTarget);
      renderer.render(scene, camera);
      meshes.forEach((m) => (m.visible = true));
      uniforms.tDepth.value = this.depthTarget.depthTexture;
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value = camera.far;
    }

    if (post) {
      // Pass B: scene -> texture, then the post shader paints it to the screen.
      renderer.setRenderTarget(this.sceneTarget);
      renderer.render(scene, camera);
      uniforms.tScene.value = this.sceneTarget.texture;
      this.postQuad.material = post;
      renderer.setRenderTarget(null);
      renderer.render(this.postScene, this.postCamera);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }

  // Render a small preview image of any effect without disturbing the view.
  thumbnail(effect, width = 240, height = 180) {
    const prev = this.current;
    const prevSize = { ...this.size };
    const prevPos = this.camera.position.clone();
    const prevAngle = this.turntable.rotation.y;

    this.setEffect(effect);
    this.camera.position.set(0, 0.45, 4.0);
    this.camera.lookAt(0, 0, 0);
    this.resize(width, height, 1);
    this.setTime(effect.thumbTime ?? 1.2);
    this.turntable.rotation.y = 0.6;
    this.renderFrame();
    const url = this.canvas.toDataURL('image/jpeg', 0.85); // read before the browser clears it

    if (prev) this.setEffect(prev.effect);
    this.camera.position.copy(prevPos);
    this.camera.lookAt(0, 0, 0);
    this.turntable.rotation.y = prevAngle;
    this.resize(prevSize.width, prevSize.height);
    this.setTime(this.elapsed);
    return url;
  }
}
