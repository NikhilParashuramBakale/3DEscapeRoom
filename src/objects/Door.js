import * as THREE from 'three';

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

    // Small reinforcing bars for visual detail.
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
    const t = 0.12;

    const left = new THREE.Mesh(new THREE.BoxGeometry(t, h + t, 0.24), metalMaterial);
    left.position.set(-t / 2, (h + t) / 2, 0);
    const right = left.clone();
    right.position.x = w + t / 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, 0.24), metalMaterial);
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
