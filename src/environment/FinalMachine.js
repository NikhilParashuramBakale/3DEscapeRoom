import * as THREE from 'three';

/**
 * FinalMachine - the big terminal machine on the south wall (Phase 18).
 *
 * The most substantial object in the room: cabinet with a central glass
 * chamber and power core, two rotor discs, three control dials, indicator
 * lamps, decorative toggles, cables, pipes running to the ceiling, and an
 * activation button.
 *
 * It is inert until Game powers it (all three earlier puzzles solved), then
 * `beginActivation()` runs a staged timeline in update():
 *   0.4 s+ indicators light in sequence
 *   0.8 s+ rotors spin up
 *   1.2 s+ power core glows
 *   1.6 s+ pipes energise
 * Nothing teleports - every value eases toward its target.
 *
 * Rules live in puzzles/FinalMachinePuzzle.js. Interaction targets are
 * invisible proxy groups, so InteractiveObject's material cloning never
 * touches materials animated every frame.
 */
export class FinalMachine {
  /**
   * @param {object} opts
   * @param {object} opts.materials shared material library
   * @param {import('../puzzles/FinalMachinePuzzle.js').FinalMachinePuzzle} opts.puzzle
   */
  constructor({ materials, puzzle }) {
    this.m = materials;
    this.puzzle = puzzle;

    this.group = new THREE.Group();
    this.group.name = 'FinalMachine';

    /** True once Game confirms the three prerequisite puzzles. */
    this.powered = false;
    /** True once the activation sequence has been triggered. */
    this.activated = false;
    this._actT = 0;      // seconds since activation began
    this._rotorSpeed = 0; // rad/s, eased up during activation

    /** Invisible registration proxies (3 dials + the activate button). */
    this.dialProxies = [];
    this.activateProxy = null;

    this._buildCabinet();
    this._buildChamber();
    this._buildDials();
    this._buildRotors();
    this._buildDetails();
  }

  _buildCabinet() {
    const m = this.m;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 1.1), m.darkMetal);
    plinth.position.y = 0.075;
    plinth.receiveShadow = true;
    this.group.add(plinth);

    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 0.9), m.metal);
    cabinet.position.y = 1.15;
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.group.add(cabinet);

    // Front control panel, slightly proud of the cabinet face.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 0.06), m.darkMetal);
    panel.position.set(0, 1.15, 0.48);
    this.group.add(panel);

    // Corner rivets for the heavy-industrial look.
    for (const [x, y] of [[-1.0, 0.35], [1.0, 0.35], [-1.0, 1.95], [1.0, 1.95]]) {
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), m.metal);
      rivet.position.set(x, y, 0.52);
      this.group.add(rivet);
    }
  }

  _buildChamber() {
    // Central glass chamber with the power core inside it.
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20),
      new THREE.MeshStandardMaterial({ color: 0x9fc4d4, transparent: true, opacity: 0.3, roughness: 0.15 })
    );
    shell.position.set(0, 1.55, 0.62);
    this.group.add(shell);

    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0x182026,
      emissive: 0x7ff0d8,
      emissiveIntensity: 0.03,
      roughness: 0.35,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), this.coreMat);
    core.position.set(0, 1.55, 0.62);
    this.group.add(core);
    this.core = core;

    // Chamber caps.
    for (const y of [1.12, 1.98]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 20), this.m.darkMetal);
      cap.position.set(0, y, 0.62);
      this.group.add(cap);
    }
  }

  _buildDials() {
    // Three control dials along the lower panel. Each rotates about local Z;
    // a pale pointer makes 0/90/180/270 readable at a glance.
    this.dials = [];
    for (let i = 0; i < 3; i++) {
      const x = -0.7 + i * 0.7;

      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 18), this.m.metal);
      bezel.rotation.x = Math.PI / 2;
      bezel.position.set(x, 0.62, 0.53);
      this.group.add(bezel);

      const dial = new THREE.Group();
      dial.position.set(x, 0.62, 0.57);

      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.07, 16), this.m.darkMetal);
      knob.rotation.x = Math.PI / 2;
      dial.add(knob);

      const pointer = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.11, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: 0.6 })
      );
      pointer.position.y = 0.06;
      dial.add(pointer);

      this.group.add(dial);
      this.dials.push(dial);

      // Invisible proxy for raycast registration (see class docs).
      const proxy = new THREE.Group();
      proxy.name = `DialProxy-${i + 1}`;
      proxy.position.set(x, 0.62, 0.62);
      this.group.add(proxy);
      this.dialProxies.push(proxy);
    }
  }


  _buildRotors() {
    // Two rotor discs flanking the chamber - they spin only after activation.
    this.rotors = [];
    for (const x of [-0.75, 0.75]) {
      const rotor = new THREE.Group();
      rotor.position.set(x, 1.55, 0.56);

      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 20), this.m.metal);
      disc.rotation.x = Math.PI / 2;
      rotor.add(disc);

      for (let b = 0; b < 6; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.05, 0.02),
          this.m.darkMetal
        );
        const a = (b / 6) * Math.PI * 2;
        blade.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.04);
        blade.rotation.z = a;
        rotor.add(blade);
      }

      this.group.add(rotor);
      this.rotors.push(rotor);
    }
  }

  _buildDetails() {
    const m = this.m;

    // Indicator lamps above the dials (one per dial) + a master lamp.
    this.indicatorMats = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2a3138, emissive: 0x35e065, emissiveIntensity: 0.05,
      });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat);
      lamp.position.set(i < 3 ? -0.7 + i * 0.7 : 0, i < 3 ? 0.95 : 2.12, 0.52);
      this.group.add(lamp);
      this.indicatorMats.push(mat);
    }

    // Decorative toggle strip along the bottom of the panel.
    for (let i = 0; i < 6; i++) {
      const toggle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.05), m.metal);
      toggle.position.set(-1.0 + i * 0.4, 0.28, 0.52);
      this.group.add(toggle);
    }

    // Two pipes rising from the cabinet to the ceiling.
    this.pipeMat = new THREE.MeshStandardMaterial({
      color: 0x2a3138, emissive: 0x35e065, emissiveIntensity: 0.02, roughness: 0.5, metalness: 0.6,
    });
    for (const x of [-0.95, 0.95]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 10), this.pipeMat);
      pipe.position.set(x, 2.8, 0.2);
      this.group.add(pipe);
      // Elbow into the cabinet top.
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), m.metal);
      joint.position.set(x, 2.16, 0.2);
      this.group.add(joint);
    }

    // Cables draped down the sides (simple sagging segments).
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const cable = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.9 + i * 0.15, 6),
          new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.9 })
        );
        cable.position.set(s * (1.12 + i * 0.04), 1.5, 0.3 - i * 0.06);
        cable.rotation.z = s * 0.12;
        this.group.add(cable);
      }
    }

    // Activation button on the right flank of the panel.
    this.buttonMat = new THREE.MeshStandardMaterial({
      color: 0x3a1414, emissive: 0xff4040, emissiveIntensity: 0.4, roughness: 0.5,
    });
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16), this.buttonMat);
    button.rotation.x = Math.PI / 2;
    button.position.set(1.0, 0.62, 0.53);
    this.group.add(button);

    this.activateProxy = new THREE.Group();
    this.activateProxy.name = 'ActivateProxy';
    this.activateProxy.position.set(1.0, 0.62, 0.6);
    this.group.add(this.activateProxy);
  }


  /**
   * Start the staged activation timeline (called once by Game).
   *
   * Steps 3-7 of the activation sequence play out inside update(): lamps in
   * sequence, rotors spinning up, core glowing, pipes energising. Step 1
   * (knobs stop) is inherent - the puzzle locks itself when solved.
   */
  beginActivation() {
    if (this.activated) return; // never restart the sequence
    this.activated = true;
    this._actT = 0;
  }

  /** Per-frame: dial angles, activation timeline, eased lighting states. */
  update(dt) {
    // Dials: discrete target angle per state, damped so turns animate.
    // Once activated they are locked (puzzle.solved blocks turn()).
    for (let i = 0; i < this.dials.length; i++) {
      const target = -(this.puzzle.states[i] * Math.PI) / 2;
      this.dials[i].rotation.z = THREE.MathUtils.damp(this.dials[i].rotation.z, target, 10, dt);
    }

    if (this.activated) this._actT += dt;

    // STEP 3: indicators light in sequence (0.4 s, 0.7 s, 1.0 s; master 1.3 s).
    for (let i = 0; i < this.indicatorMats.length; i++) {
      const on = this._actT > 0.4 + i * 0.3;
      const target = on ? 2.6 : 0.05;
      this.indicatorMats[i].emissiveIntensity = THREE.MathUtils.damp(
        this.indicatorMats[i].emissiveIntensity, target, 6, dt
      );
    }

    // STEP 4: rotors spin up from 0.8 s.
    const speedTarget = this._actT > 0.8 ? 5.0 : 0;
    this._rotorSpeed = THREE.MathUtils.damp(this._rotorSpeed, speedTarget, 2, dt);
    for (const rotor of this.rotors) rotor.rotation.z += this._rotorSpeed * dt;

    // STEP 5: power core glows from 1.2 s, slowly pulsing once lit.
    const coreTarget = this._actT > 1.2
      ? 2.6 + Math.sin(performance.now() * 0.004) * 0.5
      : 0.03;
    this.coreMat.emissiveIntensity = THREE.MathUtils.damp(this.coreMat.emissiveIntensity, coreTarget, 4, dt);
    if (this.activated && this._actT > 1.2) this.core.rotation.y += dt * 0.6;

    // STEP 6: pipes energise from 1.6 s.
    const pipeTarget = this._actT > 1.6 ? 2.0 : 0.02;
    this.pipeMat.emissiveIntensity = THREE.MathUtils.damp(this.pipeMat.emissiveIntensity, pipeTarget, 5, dt);

    // Activation button: steady warning red, brightens once online.
    const btnTarget = this.activated && this._actT > 1.6 ? 1.6 : 0.4;
    this.buttonMat.emissiveIntensity = THREE.MathUtils.damp(this.buttonMat.emissiveIntensity, btnTarget, 5, dt);
  }
}

