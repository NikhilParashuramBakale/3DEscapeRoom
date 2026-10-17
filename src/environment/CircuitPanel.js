import * as THREE from 'three';
import { CIRCUIT_CHANNELS } from '../puzzles/CircuitPuzzle.js';

/**
 * CircuitPanel - wall-mounted electrical control panel (Phase 16).
 *
 * Old-lab control panel: steel cabinet, 5 toggle switches with per-channel
 * indicator lamps, a power meter with a live needle, a red warning dome,
 * and a central output socket that lights when the circuit is complete.
 *
 * The RULES live in puzzles/CircuitPuzzle.js. This class only mirrors
 * states to meshes. Interaction uses invisible proxy groups (one per
 * switch) so InteractiveObject's material cloning never touches the lamp
 * materials animated every frame.
 */
const CHANNEL_HEX = {
  red: 0xff3b30,
  green: 0x35e065,
  yellow: 0xffd60a,
  blue: 0x3fa9ff,
  white: 0xf2f5f7,
};

/**
 * Lever throw angles (rotation about the pivot's X axis).
 *
 * The old targets were +0.5 (OFF) / -0.5 (ON). Because the pivot sat only
 * 0.15 in front of the plate while the handle is 0.23 long, the negative ON
 * throw swung the knob ~0.07 m BACKWARD through the face plate - the lever
 * visibly sank inside the cabinet.
 *
 * Now the lever flips DOWN (135 deg: tip below the pivot, angled forward)
 * to UP (0 deg: upright), sweeping entirely through the space IN FRONT of
 * the panel. With LEVER_PIVOT_Z the deepest point stays in front of
 * PLATE_FRONT_Z in both positions.
 */
export const LEVER_OFF_ANGLE = Math.PI * 0.75;
export const LEVER_ON_ANGLE = 0;
/** Z of the lever pivot in panel-local space. */
export const LEVER_PIVOT_Z = 0.18;
/** Front face of the face plate (0.095 + 0.03 / 2). */
export const PLATE_FRONT_Z = 0.11;

export class CircuitPanel {
  constructor({ materials, puzzle }) {
    this.m = materials;
    this.puzzle = puzzle;

    this.group = new THREE.Group();
    this.group.name = 'CircuitPanel';

    this.levers = [];
    this.lampMats = [];
    this.switchProxies = [];
    /** True once Game powers it (gear machine running) - wakes the meter. */
    this.powered = false;
    this._warningFlash = 0;
    /** Damped 0..1 display value for the proximity bar (target = 1). */
    this._progressShown = 0;

    this._buildCabinet();
    this._buildSwitches();
    this._buildMeter();
    this._buildWarning();
    this._buildSocket();
    this._buildProgressBar();
  }

  _buildCabinet() {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.18), this.m.darkMetal);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 0.03), this.m.metal);
    plate.position.z = 0.095;
    this.group.add(plate);

    for (const [x, y] of [[-0.95, 0.6], [0.95, 0.6], [-0.95, -0.6], [0.95, -0.6]]) {
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), this.m.darkMetal);
      rivet.position.set(x, y, 0.11);
      this.group.add(rivet);
    }
  }
  _buildSwitches() {
    for (let i = 0; i < 5; i++) {
      const x = -0.72 + i * 0.36;
      const channel = CIRCUIT_CHANNELS[i];
      const hex = CHANNEL_HEX[channel];
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.09), this.m.plastic);
      base.position.set(x, -0.05, 0.14);
      this.group.add(base);
      const pivot = new THREE.Group();
      pivot.position.set(x, -0.05, LEVER_PIVOT_Z);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.22, 8), this.m.wood);
      handle.position.y = 0.11;
      handle.castShadow = true;
      pivot.add(handle);
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 8),
        new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4 })
      );
      knob.position.y = 0.23;
      pivot.add(knob);
      pivot.rotation.x = LEVER_OFF_ANGLE;
      this.group.add(pivot);
      this.levers.push(pivot);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a3138, emissive: hex, emissiveIntensity: 0.05 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), lampMat);
      lamp.position.set(x, 0.3, 0.12);
      this.group.add(lamp);
      this.lampMats.push(lampMat);
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.04, 0.02),
        new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6 })
      );
      band.position.set(x, -0.28, 0.11);
      this.group.add(band);
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6),
        new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.6 })
      );
      wire.position.set(x, -0.42, 0.1);
      this.group.add(wire);
      const proxy = new THREE.Group();
      proxy.name = `CircuitSwitch-${i + 1}`;
      proxy.position.set(x, 0.0, 0.2);
      this.group.add(proxy);
      this.switchProxies.push(proxy);
    }
    // The old plain bus bar at y = -0.53 is now the proximity bar track
    // (see _buildProgressBar); the channel wires above still feed into it.
  }
  _buildMeter() {
    // Top-left, ABOVE the indicator-lamp row (lamps live at y = 0.3). The
    // old y = 0.3 placement put the housing straight over lamp 1 (x =
    // -0.72), hiding that channel's indicator completely.
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.08), this.m.plastic);
    housing.position.set(-0.62, 0.52, 0.12);
    this.group.add(housing);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: 0.8 })
    );
    face.position.set(-0.62, 0.52, 0.165);
    this.group.add(face);
    this.needlePivot = new THREE.Group();
    this.needlePivot.position.set(-0.62, 0.42, 0.17);
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.2, 0.005),
      new THREE.MeshStandardMaterial({ color: 0xb02020 })
    );
    needle.position.y = 0.1;
    this.needlePivot.add(needle);
    this.group.add(this.needlePivot);
    this.needlePivot.rotation.z = 0.7;
  }
  _buildWarning() {
    this.warningMat = new THREE.MeshStandardMaterial({ color: 0x3a1414, emissive: 0xff2222, emissiveIntensity: 0.15 });
    // Top-right, ABOVE the lamp row - the old y = 0.3 sat on top of the
    // switch-4/5 lamps and hid them behind the dome.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.warningMat);
    dome.position.set(0.62, 0.52, 0.12);
    this.group.add(dome);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.04, 12), this.m.darkMetal);
    collar.position.set(0.62, 0.52, 0.12);
    this.group.add(collar);
  }
  _buildSocket() {
    this.socketMat = new THREE.MeshStandardMaterial({ color: 0x2a3138, emissive: 0x35e065, emissiveIntensity: 0.05 });
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), this.socketMat);
    socket.rotation.x = Math.PI / 2;
    // Top centre. It used to sit at (0, -0.05) - exactly where switch 3's base
    // and lever live (switches run -0.72 + i*0.36, so i=2 is x=0, y=-0.05) - so
    // the socket cylinder and the switch housing interpenetrated and their front
    // faces z-fought.
    socket.position.set(0, 0.55, 0.12);
    this.group.add(socket);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 8, 20), this.m.metal);
    ring.position.set(0, 0.55, 0.13);
    this.group.add(ring);
  }
  /**
   * Proximity bar along the bottom edge - the panel's old bus bar, reused.
   *
   * Fills from the LEFT as more channels match the target combination
   * (Game also toasts "n of 5 channels aligned"); it reaches the green
   * target notch at the right end exactly when the puzzle solves. The
   * channel wires run down into it, so it reads as the bank's return line.
   */
  _buildProgressBar() {
    const track = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.02), this.m.plastic);
    track.position.set(0, -0.53, 0.105);
    this.group.add(track);
    const groove = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.05, 0.02), this.m.darkMetal);
    groove.position.set(0, -0.53, 0.112);
    this.group.add(groove);
    // Fill is anchored at the LEFT end; scaling x slides it toward the notch.
    this.progressMat = new THREE.MeshStandardMaterial({
      color: 0x14181c, emissive: 0xffb020, emissiveIntensity: 1.2,
    });
    const fill = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.035, 0.015), this.progressMat);
    fill.position.x = 0.91; // the group pivot sits at the bar's left end
    this.progressFill = new THREE.Group();
    this.progressFill.position.set(-0.91, -0.53, 0.122);
    this.progressFill.add(fill);
    this.group.add(this.progressFill);
    // Green target notch at the success end.
    const notch = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.07, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x35e065, emissive: 0x35e065, emissiveIntensity: 1.6 })
    );
    notch.position.set(0.93, -0.53, 0.122);
    this.group.add(notch);
  }
  flashWarning(dur = 1.0) {
    this._warningFlash = Math.max(this._warningFlash, dur);
  }
  update(dt) {
    const states = this.puzzle.switches;
    for (let i = 0; i < this.levers.length; i++) {
      const target = states[i] ? LEVER_ON_ANGLE : LEVER_OFF_ANGLE;
      this.levers[i].rotation.x = THREE.MathUtils.damp(this.levers[i].rotation.x, target, 12, dt);
      const lampTarget = states[i] ? 2.4 : 0.05;
      this.lampMats[i].emissiveIntensity = THREE.MathUtils.damp(this.lampMats[i].emissiveIntensity, lampTarget, 10, dt);
    }
    // Proximity fraction: how many channels match the target (0..1). The
    // needle and the bottom bar both read from it, so the two instruments
    // always agree.
    const frac = this.puzzle.solved ? 1 : this.puzzle.correctCount / this.puzzle.switches.length;

    // Power meter: dead at zero (needle up-left) when unpowered; once live
    // the needle sweeps left-to-right in proportion to the aligned channels
    // (small jitter so the panel feels energised), pins at full when solved
    // - the same direction the proximity bar fills.
    let meterTarget = 0.7; // zero (rest position)
    if (this.puzzle.solved) {
      meterTarget = -0.7; // full
    } else if (this.powered) {
      meterTarget = 0.7 - frac * 1.4 + Math.sin(performance.now() * 0.02) * 0.06;
    }
    this.needlePivot.rotation.z = THREE.MathUtils.damp(this.needlePivot.rotation.z, meterTarget, 6, dt);

    // Proximity bar: slides toward the green target notch as more channels
    // match; locks on (green, steady) the moment the circuit solves.
    this._progressShown = THREE.MathUtils.damp(this._progressShown, frac, 6, dt);
    this.progressFill.scale.x = Math.max(0.001, this._progressShown);
    if (this.puzzle.solved) {
      this.progressMat.emissive.setHex(0x35e065);
      this.progressMat.emissiveIntensity = 2.2;
    }
    if (this._warningFlash > 0) this._warningFlash = Math.max(0, this._warningFlash - dt);
    const warnTarget = this.puzzle.solved ? 0.05 : this._warningFlash > 0 ? 3.0 : 0.6;
    this.warningMat.emissiveIntensity = THREE.MathUtils.damp(this.warningMat.emissiveIntensity, warnTarget, 8, dt);
    const socketTarget = this.puzzle.solved ? 2.6 : 0.05;
    this.socketMat.emissiveIntensity = THREE.MathUtils.damp(this.socketMat.emissiveIntensity, socketTarget, 6, dt);
  }
}
