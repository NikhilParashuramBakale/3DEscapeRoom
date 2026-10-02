import * as THREE from 'three';
import { makeLabelTexture } from '../environment/Materials.js';

/**
 * Keypad - the combination lock on the drawer's pedestal (Phase 7).
 *
 * Owns two things the rest of the game cares about:
 *   - the visual prop: a body, a numeric keypad of 12 keys and a small display
 *     whose texture is redrawn whenever the entered code changes
 *   - the lock state and the correctness test
 *
 * The correct code is NOT hard-coded here. It is derived from the note the
 * player found (see puzzles/CodeSheet.js), so changing the note automatically
 * changes the answer.
 */
export class Keypad {
  /**
   * @param {object} opts
   * @param {THREE.Material} opts.bodyMaterial
   * @param {THREE.Material} opts.keyMaterial
   * @param {number} opts.solution the correct code
   */
  constructor({ bodyMaterial, keyMaterial, solution = null } = {}) {
    this.solution = solution;
    this.isUnlocked = false;
    this.displayValue = '';

    this.group = new THREE.Group();
    this.group.name = 'Keypad';

    // --- Body ---------------------------------------------------------
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.05), bodyMaterial);
    body.castShadow = true;
    this.group.add(body);

    // --- Display ------------------------------------------------------
    // The canvas is kept around so the texture can be redrawn cheaply when the
    // player types; a new texture per keystroke would leak GPU memory.
    this._displayCanvas = document.createElement('canvas');
    this._displayCanvas.width = 256;
    this._displayCanvas.height = 96;
    this._displayCtx = this._displayCanvas.getContext('2d');
    this._displayTex = new THREE.CanvasTexture(this._displayCanvas);
    this._displayTex.colorSpace = THREE.SRGBColorSpace;

    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.075),
      new THREE.MeshBasicMaterial({ map: this._displayTex })
    );
    display.position.set(0, 0.14, 0.026);
    this.group.add(display);
    this._drawDisplay();

    // --- Keys ---------------------------------------------------------
    // 1-9, then Clear / 0 / Enter in the bottom row.
    this.keyMeshes = {};
    const layout = [
      ['1', -0.065, 0.055], ['2', 0, 0.055], ['3', 0.065, 0.055],
      ['4', -0.065, -0.015], ['5', 0, -0.015], ['6', 0.065, -0.015],
      ['7', -0.065, -0.085], ['8', 0, -0.085], ['9', 0.065, -0.085],
      ['C', -0.065, -0.155], ['0', 0, -0.155], ['OK', 0.065, -0.155],
    ];
    for (const [label, kx, ky] of layout) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.016), keyMaterial);
      key.position.set(kx, ky, 0.034);
      key.castShadow = true;
      key.name = `key-${label}`;
      this.group.add(key);
      this.keyMeshes[label] = key;
    }

    // Labels floating just above each key so the numbers are legible.
    for (const [label, kx, ky] of layout) {
      const tex = makeLabelTexture(label, '#0e1418', '#7ff0d8');
      const cap = new THREE.Mesh(
        new THREE.PlaneGeometry(0.036, 0.018),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      cap.position.set(kx, ky, 0.044);
      this.group.add(cap);
    }
  }

  /** Redraw the display texture. Cheap enough to call on every keystroke. */
  _drawDisplay() {
    const ctx = this._displayCtx;
    const c = this._displayCanvas;

    ctx.fillStyle = '#08110d';
    ctx.fillRect(0, 0, c.width, c.height);

    // Asterisks mask the entered digits; an empty pad reads as "-".
    const shown = this.displayValue.length ? '*'.repeat(this.displayValue.length) : '---';
    ctx.fillStyle = this.isUnlocked ? '#7ff0d8' : '#66d9c4';
    ctx.font = 'bold 52px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shown, c.width / 2, c.height / 2 + 3);

    this._displayTex.needsUpdate = true;
  }

  /** Append a digit, ignoring input once the lock is open. */
  pushDigit(digit) {
    if (this.isUnlocked) return;
    this.displayValue += String(digit);
    this._drawDisplay();
  }

  /** Clear the entry buffer without changing the lock state. */
  clearEntry() {
    if (this.isUnlocked) return;
    this.displayValue = '';
    this._drawDisplay();
  }

  /**
   * Check the entered code.
   * @returns {{correct: boolean, unlocked: boolean}}
   */
  submit() {
    if (this.isUnlocked) return { correct: true, unlocked: true };

    const entry = this.displayValue;
    const correct =
      this.solution !== null && entry !== '' && Number(entry) === Number(this.solution);

    if (correct) {
      this.isUnlocked = true;
      this.displayValue = '';
      this._drawDisplay();
      return { correct: true, unlocked: true };
    }

    // Wrong code wipes the buffer so the player starts again cleanly.
    this.displayValue = '';
    this._drawDisplay();
    return { correct: false, unlocked: false };
  }
}