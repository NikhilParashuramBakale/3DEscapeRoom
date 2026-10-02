import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * PlayerController - first-person movement and mouse look.
 *
 * Uses Three.js PointerLockControls (it handles pointer lock and pitch
 * clamping). Collision is deliberately simple: an axis-aligned bounding box
 * per solid object. Each axis is resolved separately so the player slides
 * along walls naturally, and no physics engine is required.
 */
export class PlayerController {
  constructor(camera, domElement) {
    this.controls = new PointerLockControls(camera, domElement);
    this.object = this.controls.object; // the camera
    this.keys = new Set();
    this.speed = 3.2;
    this.eyeHeight = 1.7;
    this.radius = 0.35;
    this.colliders = [];
    this.bounds = { minX: -8, maxX: 8, minZ: -6, maxZ: 6 };
    this.blocked = false; // true when a UI (keypad) pauses control

    this._bobTime = 0;
    this._baseY = this.eyeHeight;
    this._forward = new THREE.Vector3(); // reused scratch vector, no per-frame alloc

    this._onKeyDown = (event) => {
      if (
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(
          event.code
        )
      ) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    };
    this._onKeyUp = (event) => this.keys.delete(event.code);
    this._onClick = () => {
      if (!this.controls.isLocked && !this.blocked) this.controls.lock();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    domElement.addEventListener('click', this._onClick);
  }

  setSpawn(x, z) {
    this.object.position.set(x, this.eyeHeight, z);
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  setColliders(colliders) {
    this.colliders = colliders;
  }

  /** Suspend movement (used by the keypad / reading UI in later phases). */
  setBlocked(blocked) {
    this.blocked = blocked;
    if (blocked) this.keys.clear();
  }

  /** True if a circle at (x, z) would overlap a collider or leave the room. */
  _collides(x, z) {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    if (x < minX || x > maxX || z < minZ || z > maxZ) return true;
    const r = this.radius;
    for (const c of this.colliders) {
      if (c.top !== undefined && c.top < 0.4) continue; // low objects are steppable
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  update(delta) {
    const pos = this.object.position;

    if (this.controls.isLocked && !this.blocked) {
      const f =
        (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
        (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
      const s =
        (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
        (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);

      const distance = this.speed * delta;

      // Movement is relative to the direction the player is LOOKING.
      //
      // We must NOT read `camera.rotation.y` for this. PointerLockControls
      // writes the camera with a 'YXZ' Euler, while the camera's own
      // rotation.order is 'XYZ'. The two orders disagree once pitch is
      // involved, so rotation.y is not the true yaw - at 180 degrees the
      // computed forward vector comes out exactly inverted, and while
      // looking up/down it is off by the pitch angle.
      //
      // Instead we read the camera's real world direction from its world
      // matrix, then flatten it onto the XZ plane so that looking up or
      // down never tilts the movement.
      this.object.getWorldDirection(this._forward);
      this._forward.y = 0;
      if (this._forward.lengthSq() < 1e-6) this._forward.set(0, 0, -1);
      this._forward.normalize();

      const fx = this._forward.x;
      const fz = this._forward.z;

      // Right = forward rotated -90 degrees about the Y axis.
      const rx = -fz;
      const rz = fx;

      if (f !== 0) {
        const nx = pos.x + fx * distance * f;
        const nz = pos.z + fz * distance * f;
        if (!this._collides(nx, pos.z)) pos.x = nx;
        if (!this._collides(pos.x, nz)) pos.z = nz;
      }
      if (s !== 0) {
        const nx = pos.x + rx * distance * s;
        const nz = pos.z + rz * distance * s;
        if (!this._collides(nx, pos.z)) pos.x = nx;
        if (!this._collides(pos.x, nz)) pos.z = nz;
      }

      // Subtle head bob while walking (translation animation).
      if (f !== 0 || s !== 0) {
        this._bobTime += delta * 9;
        pos.y = this._baseY + Math.sin(this._bobTime) * 0.035;
      } else {
        this._bobTime = 0;
        pos.y = THREE.MathUtils.damp(pos.y, this._baseY, 10, delta);
      }
    } else {
      pos.y = THREE.MathUtils.damp(pos.y, this._baseY, 10, delta);
    }
  }
}
