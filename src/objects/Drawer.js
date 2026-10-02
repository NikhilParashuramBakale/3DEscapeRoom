import * as THREE from 'three';

/**
 * Drawer - the pedestal drawer that slides open along +Z (Phase 7).
 *
 * The drawer geometry itself is built by Props.buildDesk() and handed to this
 * class, which adds the behaviour: lock state and an animated slide.
 *
 * Demonstrates: translation animation via a damped lerp (the counterpart to
 * Door's rotation), and a small state machine driven from Game.
 */
export class Drawer {
  /**
   * @param {THREE.Group} group the drawer group from Props.buildDesk()
   * @param {object} opts
   * @param {number} [opts.openDistance] how far it slides along +Z
   */
  constructor(group, { openDistance = 0.55 } = {}) {
    this.group = group;
    this.openDistance = openDistance;

    this.isLocked = true;
    this.isOpen = false;
    this._closedZ = group.position.z;
  }

  unlock() {
    this.isLocked = false;
  }

  open() {
    if (this.isLocked) return false;
    this.isOpen = true;
    return true;
  }

  close() {
    this.isOpen = false;
  }

  toggle() {
    if (this.isLocked) return false;
    this.isOpen ? this.close() : this.open();
    return true;
  }

  /** Per-frame damped slide toward the open or closed position. */
  update(dt) {
    const target = this.isOpen ? this._closedZ + this.openDistance : this._closedZ;
    this.group.position.z = THREE.MathUtils.damp(this.group.position.z, target, 5, dt);
  }
}