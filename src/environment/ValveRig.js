import * as THREE from 'three';

/**
 * ValveRig - wall-mounted pressure-control mechanism (Phase 17).
 *
 * Three valve handwheels on a pipe manifold, a pressure gauge, a central
 * pressure chamber, indicator lights and a warning dome. Physically dead
 * until `powered` is set (after the circuit puzzle): the gauge reads zero
 * and no lamps light until then.
 *
 * Rules live in puzzles/ValvePuzzle.js; this class only mirrors `states`
 * to wheel angles and animates the gauge/lights toward the puzzle state.
 * Interaction uses invisible proxy groups so InteractiveObject's material
 * cloning never touches materials animated every frame.
 */
export class ValveRig {
  /**
   * @param {object} opts
   * @param {object} opts.materials shared material library
   * @param {import('../puzzles/ValvePuzzle.js').ValvePuzzle} opts.puzzle
   */
  constructor({ materials, puzzle }) {
    this.m = materials;
    this.puzzle = puzzle;

    this.group = new THREE.Group();
    this.group.name = 'ValveRig';

    /** Set true by Game once circuitPuzzleSolved - enables gauge + lamps. */
    this.powered = false;

    /** Handwheel pivot groups, indexed like puzzle.states. */
    this.wheels = [];
    /** Invisible registration proxies, one per valve. */
    this.valveProxies = [];
    /** Drop-pipe materials lit in sequence on solve. */
    this.pipeMats = [];
    this._warningFlash = 0;
    this._solveClock = 0; // time since solve, drives sequential pipe lighting

    this._buildFrame();
    this._buildValves();
    this._buildGauge();
    this._buildChamber();
    this._buildIndicators();
  }

  _buildFrame() {
    // Back plate the manifold mounts to.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.7, 0.12), this.m.darkMetal);
    plate.castShadow = true;
    plate.receiveShadow = true;
    this.group.add(plate);

    // Horizontal manifold pipe across the top.
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 12), this.m.metal);
    main.rotation.z = Math.PI / 2;
    main.position.y = 0.62;
    this.group.add(main);

    // Three drop pipes from the manifold to the valves. Each gets its own
    // material so they can light up in sequence after the solve.
    for (let i = 0; i < 3; i++) {
      const x = -0.7 + i * 0.7;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2a3138,
        emissive: 0x35e065,
        emissiveIntensity: 0.02,
        roughness: 0.5,
        metalness: 0.6,
      });
      const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 10), mat);
      drop.position.set(x, 0.27, 0.06);
      this.group.add(drop);
      this.pipeMats.push(mat);
    }
  }

  _buildValves() {
    for (let i = 0; i < 3; i++) {
      const x = -0.7 + i * 0.7;

      // Valve body (fixed) - a squat cylinder the wheel turns against.
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.16, 12), this.m.metal);
      body.rotation.x = Math.PI / 2;
      body.position.set(x, -0.08, 0.14);
      this.group.add(body);

      // Handwheel (rotates about local Z - toward the player).
      const wheel = new THREE.Group();
      wheel.position.set(x, -0.08, 0.24);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 20), this.m.darkMetal);
      wheel.add(rim);

      // Three spokes + one pale handle so the orientation reads at a glance:
      // the handle is what points UP/RIGHT/DOWN/LEFT.
      for (let s = 0; s < 3; s++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.02), this.m.metal);
        spoke.rotation.z = (s * Math.PI * 2) / 3;
        wheel.add(spoke);
      }
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.3, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: 0.6 })
      );
      handle.position.y = 0.15;
      wheel.add(handle);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), this.m.metal);
      hub.rotation.x = Math.PI / 2;
      wheel.add(hub);

      this.group.add(wheel);
      this.wheels.push(wheel);

      // Invisible proxy for raycast registration (see class docs).
      const proxy = new THREE.Group();
      proxy.name = `ValveProxy-${i + 1}`;
      proxy.position.set(x, -0.08, 0.3);
      this.group.add(proxy);
      this.valveProxies.push(proxy);
    }
  }

  _buildGauge() {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 20), this.m.darkMetal);
    housing.rotation.x = Math.PI / 2;
    housing.position.set(0.85, 0.55, 0.1);
    this.group.add(housing);

    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 20),
      new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: 0.85 })
    );
    face.position.set(0.85, 0.55, 0.14);
    this.group.add(face);

    // Needle pivots at the dial centre; rotation.z sweeps the reading.
    this.needlePivot = new THREE.Group();
    this.needlePivot.position.set(0.85, 0.55, 0.145);
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.15, 0.005),
      new THREE.MeshStandardMaterial({ color: 0xb02020 })
    );
    needle.position.y = 0.075;
    this.needlePivot.add(needle);
    this.group.add(this.needlePivot);
    this.needlePivot.rotation.z = 2.4; // rest = zero pressure (lower-left)
  }


  _buildChamber() {
    // Central pressure chamber: translucent shell + emissive core inside.
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.5, 16),
      new THREE.MeshStandardMaterial({ color: 0x8fb8c8, transparent: true, opacity: 0.35, roughness: 0.2 })
    );
    shell.position.set(0, -0.55, 0.16);
    this.group.add(shell);

    this.chamberMat = new THREE.MeshStandardMaterial({
      color: 0x1c2126,
      emissive: 0x35e065,
      emissiveIntensity: 0.03,
      roughness: 0.4,
    });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.44, 14), this.chamberMat);
    core.position.set(0, -0.55, 0.16);
    this.group.add(core);

    for (const y of [-0.82, -0.28]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 16), this.m.metal);
      collar.position.set(0, y, 0.16);
      this.group.add(collar);
    }
  }

  _buildIndicators() {
    // Warning dome (red) - flashes on a wrong configuration.
    this.warningMat = new THREE.MeshStandardMaterial({
      color: 0x3a1414, emissive: 0xff2222, emissiveIntensity: 0.12,
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      this.warningMat
    );
    dome.position.set(-0.85, 0.55, 0.1);
    this.group.add(dome);

    // Stability lamp (green) - lit only when pressure is stable (solved).
    this.stableMat = new THREE.MeshStandardMaterial({
      color: 0x14261a, emissive: 0x35e065, emissiveIntensity: 0.05,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), this.stableMat);
    lamp.position.set(-0.85, 0.32, 0.1);
    this.group.add(lamp);
  }

  /** Kick the warning dome into a bright flash for `dur` seconds. */
  flashWarning(dur = 1.0) {
    this._warningFlash = Math.max(this._warningFlash, dur);
  }


  /** Per-frame: ease wheels, gauge, pipes and lamps toward puzzle state. */
  update(dt) {
    // Handwheels: discrete target angle per state, damped so turns animate.
    for (let i = 0; i < this.wheels.length; i++) {
      const target = -(this.puzzle.states[i] * Math.PI) / 2;
      this.wheels[i].rotation.z = THREE.MathUtils.damp(this.wheels[i].rotation.z, target, 8, dt);
    }

    // Gauge: dead at zero when unpowered, sweeps (with a wobble) toward
    // correctCount when powered but unstable, pins full and steady when solved.
    let needleTarget = 2.4; // zero pressure
    if (this.puzzle.solved) {
      needleTarget = -0.7; // full, stable
    } else if (this.powered) {
      const base = 2.4 - (this.puzzle.correctCount / 3) * 2.2;
      needleTarget = base + Math.sin(performance.now() * 0.02) * 0.18; // unstable sweep
    }
    this.needlePivot.rotation.z = THREE.MathUtils.damp(this.needlePivot.rotation.z, needleTarget, 5, dt);

    // Warning dome: bright flash on demand, dim fault glow while powered and
    // unsolved, dark once stable.
    if (this._warningFlash > 0) this._warningFlash = Math.max(0, this._warningFlash - dt);
    const warnTarget = this.puzzle.solved ? 0.05
      : this._warningFlash > 0 ? 3.0
        : this.powered ? 0.7 : 0.12;
    this.warningMat.emissiveIntensity = THREE.MathUtils.damp(
      this.warningMat.emissiveIntensity, warnTarget, 8, dt
    );

    // Stability lamp + chamber core light only when solved.
    const stableTarget = this.puzzle.solved ? 2.6 : 0.05;
    this.stableMat.emissiveIntensity = THREE.MathUtils.damp(
      this.stableMat.emissiveIntensity, stableTarget, 6, dt
    );
    this.chamberMat.emissiveIntensity = THREE.MathUtils.damp(
      this.chamberMat.emissiveIntensity, stableTarget, 5, dt
    );

    // Drop pipes illuminate in sequence after the solve (0.25 s stagger).
    if (this.puzzle.solved) {
      this._solveClock += dt;
      for (let i = 0; i < this.pipeMats.length; i++) {
        const on = this._solveClock > 0.25 * (i + 1);
        this.pipeMats[i].emissiveIntensity = THREE.MathUtils.damp(
          this.pipeMats[i].emissiveIntensity, on ? 2.2 : 0.02, 6, dt
        );
      }
    } else {
      for (const mat of this.pipeMats) {
        mat.emissiveIntensity = THREE.MathUtils.damp(mat.emissiveIntensity, 0.02, 6, dt);
      }
    }
  }
}

