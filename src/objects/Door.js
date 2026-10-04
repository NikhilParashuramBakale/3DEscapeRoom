import * as THREE from 'three';

/**
 * Shared doorway metrics.
 *
 * The head of the opening and the outer face of the door frame must be the SAME
 * height, or a slot of open air appears above the door and reads as a dark line
 * across the wall. Slimming the frame from 0.12 to 0.07 without lowering the
 * lintel silently opened a 0.05 m gap, so the frame thickness is now declared
 * once here and the wall is built from it instead of from a hard-coded 2.72.
 */
export const DOOR_FRAME_T = 0.07;

/** Clear height of the doorway opening in the north wall. */
export const DOOR_OPENING_H = 2.72;

/**
 * Door - a hinged door that opens by rotating around a pivot group.
 *
 * Demonstrates: rotation transformation + smooth animation (damped lerp),
 * lock state, and an interaction hook for the player interaction system.
 */
export class Door {
  /**
   * @param {object} opts
   * @param {THREE.Material} opts.material
   * @param {THREE.Material} opts.metalMaterial
   * @param {number} opts.width  door leaf width
   * @param {number} opts.height door leaf height
   * @param {number} opts.openAngle radians the door swings to when open
   */
  constructor({
    material,
    metalMaterial,
    width = 1.6,
    height = 2.6,
    openAngle = -Math.PI * 0.55,
  } = {}) {
    this.width = width;
    this.height = height;
    this.openAngle = openAngle;

    this.isOpen = false;
    this.isLocked = true;

    // Hinge pivot placed at the left edge of the doorway.
    this.group = new THREE.Group();
    this.group.name = 'ExitDoor';

    // Pivot -> leaf offset so rotation happens on the hinge axis.
    this.pivot = new THREE.Group();
    this.group.add(this.pivot);

    const leaf = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.08), material);
    leaf.position.set(width / 2, height / 2, 0);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    this.pivot.add(leaf);
    this.leaf = leaf;

    // Metal handle on the free edge.
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.32), metalMaterial);
    handle.position.set(width - 0.22, height * 0.5, 0.2);
    handle.castShadow = true;
    this.pivot.add(handle);

    // Two shallow reinforcing bars. Kept deliberately thin (0.02 deep) and set
    // just proud of the leaf so they read as pressed detail rather than as
    // separate slabs stuck onto the door.
    for (let i = 0; i < 2; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.07, 0.02), metalMaterial);
      bar.position.set(width / 2, height * (0.3 + i * 0.35), 0.06);
      this.pivot.add(bar);
    }

    this.group.add(this._buildFrame(metalMaterial));
  }

  _buildFrame(metalMaterial) {
    const frame = new THREE.Group();
    const w = this.width;
    const h = this.height;
    // The stiles and head were 0.12 m and stood 0.24 m proud of the leaf, which
    // read as a heavy dark box rather than a frame. Thinner and shallower keeps
    // the outline crisp.
    //
    // The head MUST finish exactly at DOOR_OPENING_H or the wall shows daylight
    // through the slot above the door as a dark line. Deriving the leaf height
    // from the opening (see Laboratory) means that holds by construction.
    const t = DOOR_FRAME_T;
    const d = 0.14;

    const left = new THREE.Mesh(new THREE.BoxGeometry(t, h + t, d), metalMaterial);
    left.position.set(-t / 2, (h + t) / 2, 0);
    const right = left.clone();
    right.position.x = w + t / 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, d), metalMaterial);
    top.position.set(w / 2, h + t / 2, 0);

    for (const part of [left, right, top]) {
      part.castShadow = true;
      frame.add(part);
    }
    return frame;
  }

  unlock() {
    this.isLocked = false;
  }

  lock() {
    this.isLocked = true;
    this.close();
  }

  open() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }

  toggle() {
    if (this.isLocked) return false;
    this.isOpen ? this.close() : this.open();
    return true;
  }

  /** Per-frame damped rotation toward the target angle. */
  update(dt) {
    const target = this.isOpen ? this.openAngle : 0;
    this.pivot.rotation.y = THREE.MathUtils.damp(this.pivot.rotation.y, target, 4, dt);
  }
}
