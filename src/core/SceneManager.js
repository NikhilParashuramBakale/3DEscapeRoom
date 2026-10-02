import * as THREE from 'three';

/**
 * SceneManager - owns the renderer, scene, camera and the render loop clock.
 *
 * Every other system receives references from here, so it is the only place
 * that knows about WebGL setup and window resizing.
 */
export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;

    // --- Renderer ---------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // --- Scene ------------------------------------------------------------
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.FogExp2(0x05070a, 0.045);

    // --- Camera -----------------------------------------------------------
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.05,
      200
    );
    this.camera.position.set(0, 1.7, 6);

    // --- Timing -----------------------------------------------------------
    this.clock = new THREE.Clock();
    this.updaters = [];

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  /** Register a per-frame callback: fn(deltaSeconds, elapsedSeconds). */
  addUpdater(fn) {
    this.updaters.push(fn);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.getElapsedTime();
      for (const fn of this.updaters) fn(dt, elapsed);
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}
