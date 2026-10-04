import * as THREE from 'three';
import { InteractiveObject } from './InteractiveObject.js';

/**
 * InteractionManager - camera-based raycasting and the E key.
 *
 * Demonstrates the raycasting requirement:
 *   - a THREE.Raycaster is fired from the centre of the camera (the crosshair)
 *   - every registered hitbox is tested
 *   - the closest valid hit within range becomes the "current" target, which
 *     drives the crosshair highlight and the interaction prompt
 *
 * Nothing about specific objects is hard-coded here: objects register
 * themselves with `register(...)`, so adding the keypad, key or gears later
 * requires no changes to this file.
 */
export class InteractionManager {
  constructor(camera, { crosshair, prompt, player } = {}) {
    this.camera = camera;
    this.crosshair = crosshair;
    this.prompt = prompt;
    this.player = player;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 4.0; // hard cap; per-object distance is checked too

    /** @type {InteractiveObject[]} */
    this.objects = [];
    this._hitboxes = [];
    this._current = null;

    this._onKeyDown = (event) => {
      if (event.code === 'KeyE') this._tryInteract();
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * Register an interactable.
   * @param {THREE.Object3D} object
   * @param {object} opts passed through to InteractiveObject
   * @returns {InteractiveObject}
   */
  register(object, opts) {
    const io = new InteractiveObject(object, opts);
    this.objects.push(io);
    this._hitboxes.push(io.hitbox);
    return io;
  }

  _tryInteract() {
    // Only allow interaction while the player has control (e.g. not while a
    // keypad UI has paused the game).
    if (this.player && (this.player.blocked || !this.player.controls.isLocked)) return;
    if (this._current) this._current.interact();
  }

  /** Per-frame: raycast from the camera centre and update the prompt. */
  update(dt, elapsed) {
    // Release the previous highlight first.
    if (this._current) {
      this._current.setCurrent(false, elapsed);
      this._current = null;
    }

    // While a modal owns the screen the player cannot act, so the raycast is
    // pure waste. intersectObjects walks every hitbox and tests every bounding
    // sphere, and with a keypad or document open the result is discarded
    // immediately afterwards anyway.
    //
    // This is NOT gated on pointer lock: the crosshair should still track what
    // the player is looking at while they hold no button, which is the normal
    // state once they press Esc.
    if (this.player && this.player.blocked) {
      if (this.crosshair) this.crosshair.setActive(false);
      if (this.prompt) this.prompt.hide();
      return;
    }

    // Fire the ray down the camera's centre axis.
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const hits = this.raycaster.intersectObjects(this._hitboxes, false);

    for (const hit of hits) {
      const io = hit.object.userData.interactive;
      if (!io || !io.enabled) continue;

      // Respect the per-object range.
      if (hit.distance > io.distance) continue;

      this._current = io;
      io.setCurrent(true, elapsed);
      break; // closest valid hit wins
    }

    // Update UI.
    const hasTarget = !!this._current;
    if (this.crosshair) this.crosshair.setActive(hasTarget);
    if (this.prompt) {
      if (hasTarget) this.prompt.show(this._current.promptText);
      else this.prompt.hide();
    }

    void dt;
  }
}
