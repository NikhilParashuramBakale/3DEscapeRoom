import * as THREE from 'three';

/**
 * InteractiveObject - makes any Object3D interactable.
 *
 * This is the "component" equivalent in Three.js: rather than hard-coding
 * interaction for the door, the keypad and the key separately, we wrap each
 * one in an InteractiveObject that carries its own prompt text and behaviour.
 *
 * Demonstrates: raycasting targets, material emissive highlighting, and
 * scaling (a small pop when the object becomes the current target).
 *
 * @param {THREE.Object3D} object   the mesh (or group) the player aims at
 * @param {object} opts
 * @param {string} opts.verb         e.g. 'Open', 'Examine', 'Pick Up'
 * @param {Function} opts.onInteract called when the player presses E
 * @param {string} [opts.label]      optional name shown in the prompt
 * @param {number} [opts.distance]   max interaction range in metres
 * @param {number} [opts.baseScale]  scale used for the highlight pop
 */
export class InteractiveObject {
  constructor(object, { verb, label = '', onInteract, distance = 3.0, baseScale = 1 } = {}) {
    this.object = object;
    this.verb = verb;
    this.label = label;
    this.onInteract = onInteract;
    this.distance = distance;
    this.baseScale = baseScale;
    this.enabled = true;
    this.isCurrent = false;

    // Clone the materials for this object only.
    //
    // The lab shares material instances between props (e.g. every wooden
    // surface uses `materials.wood`). Mutating `emissive` on a shared
    // material would highlight every object in the room at once, so each
    // interactive object gets its own copies it is free to tint.
    this._materials = [];
    object.traverse((child) => {
      if (!child.isMesh) return;
      const mat = child.material;
      if (!mat) return;

      const clone = mat.clone();
      child.material = clone;
      this._materials.push({
        mat: clone,
        emissive: clone.emissive ? clone.emissive.clone() : null,
        intensity: clone.emissiveIntensity ?? 0,
      });
    });

    // A slightly larger invisible sphere is used as the raycast target so the
    // player does not have to aim at a thin edge (e.g. the door leaf).
    this.hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    object.add(this.hitbox);
    this.hitbox.userData.interactive = this;
  }

  /** Text shown in the prompt, e.g. "Press E to Open". */
  get promptText() {
    return this.label ? `${this.verb} ${this.label}` : this.verb;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.isCurrent) this.setCurrent(false);
  }

  /** Highlight when the crosshair is on this object. */
  setCurrent(current, elapsed = 0) {
    this.isCurrent = current;
    for (const entry of this._materials) {
      if (!entry.emissive) continue;
      if (current) {
        // A faint teal lift, not a flood fill. The crosshair turning teal and
        // the "Press E" prompt are the primary "you can use this" signals;
        // the object itself only needs a subtle hint of extra light.
        entry.mat.emissive.setHex(0x1a4d45);
        entry.mat.emissiveIntensity = Math.max(entry.intensity, 0.12);
      } else {
        entry.mat.emissive.copy(entry.emissive);
        entry.mat.emissiveIntensity = entry.intensity;
      }
    }
    // Scaling transform: a very small pop while targeted.
    const target = current ? this.baseScale * 1.012 : this.baseScale;
    this.object.scale.x = THREE.MathUtils.damp(this.object.scale.x, target, 10, 1 / 60);
    this.object.scale.y = this.object.scale.z = this.object.scale.x;
    void elapsed;
  }

  interact() {
    if (!this.enabled) return false;
    if (this.onInteract) this.onInteract(this);
    return true;
  }
}
