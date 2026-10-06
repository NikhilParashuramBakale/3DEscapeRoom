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

export class CircuitPanel {
  constructor({ materials, puzzle }) {
    this.m = materials;
    this.puzzle = puzzle;

    this.group = new THREE.Group();
    this.group.name = 'CircuitPanel';

    this.levers = [];
    this.lampMats = [];
    this.switchProxies = [];
    this._warningFlash = 0;

    this._buildCabinet();
    this._buildSwitches();
    this._buildMeter();
    this._buildWarning();
    this._buildSocket();
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
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.06), this.m.plastic);
      base.position.set(x, -0.05, 0.12);
      this.group.add(base);
      const pivot = new THREE.Group();
      pivot.position.set(x, -0.05, 0.15);
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
      pivot.rotation.x = 0.5;
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
    const bus = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.05), this.m.metal);
    bus.position.set(0, -0.53, 0.1);
    this.group.add(bus);
  }
  _buildMeter() {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.08), this.m.plastic);
    housing.position.set(-0.62, 0.3, 0.12);
    this.group.add(housing);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: 0.8 })
    );
    face.position.set(-0.62, 0.3, 0.165);
    this.group.add(face);
    this.needlePivot = new THREE.Group();
    this.needlePivot.position.set(-0.62, 0.2, 0.17);
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
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.warningMat);
    dome.position.set(0.62, 0.3, 0.12);
    this.group.add(dome);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.04, 12), this.m.darkMetal);
    collar.position.set(0.62, 0.3, 0.12);
    this.group.add(collar);
  }
  _buildSocket() {
    this.socketMat = new THREE.MeshStandardMaterial({ color: 0x2a3138, emissive: 0x35e065, emissiveIntensity: 0.05 });
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), this.socketMat);
    socket.rotation.x = Math.PI / 2;
    socket.position.set(0, -0.05, 0.12);
    this.group.add(socket);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 8, 20), this.m.metal);
    ring.position.set(0, -0.05, 0.13);
    this.group.add(ring);
  }
  flashWarning(dur = 1.0) {
    this._warningFlash = Math.max(this._warningFlash, dur);
  }
  update(dt) {
    const states = this.puzzle.switches;
    for (let i = 0; i < this.levers.length; i++) {
      const target = states[i] ? -0.5 : 0.5;
      this.levers[i].rotation.x = THREE.MathUtils.damp(this.levers[i].rotation.x, target, 12, dt);
      const lampTarget = states[i] ? 2.4 : 0.05;
      this.lampMats[i].emissiveIntensity = THREE.MathUtils.damp(this.lampMats[i].emissiveIntensity, lampTarget, 10, dt);
    }
    const frac = this.puzzle.solved ? 1 : this.puzzle.correctCount / 5;
    const needleTarget = THREE.MathUtils.lerp(0.7, -0.7, frac);
    this.needlePivot.rotation.z = THREE.MathUtils.damp(this.needlePivot.rotation.z, needleTarget, 6, dt);
    if (this._warningFlash > 0) this._warningFlash = Math.max(0, this._warningFlash - dt);
    const warnTarget = this.puzzle.solved ? 0.05 : this._warningFlash > 0 ? 3.0 : 0.6;
    this.warningMat.emissiveIntensity = THREE.MathUtils.damp(this.warningMat.emissiveIntensity, warnTarget, 8, dt);
    const socketTarget = this.puzzle.solved ? 2.6 : 0.05;
    this.socketMat.emissiveIntensity = THREE.MathUtils.damp(this.socketMat.emissiveIntensity, socketTarget, 6, dt);
  }
}
