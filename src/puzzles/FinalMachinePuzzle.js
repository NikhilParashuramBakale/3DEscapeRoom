/**
 * FinalMachinePuzzle - knob logic for the final laboratory machine (Phase 18).
 *
 * Three control dials, each cycling four discrete positions (0/90/180/270
 * degrees). The solution [1, 2, 3] is not arbitrary: it is assembled from
 * three station plates placed around the lab -
 *
 *   A <- REDUCTION = 90 deg   (plate by the gear machine, east wall)
 *   B <- OUTPUT   = 180 deg  (plate by the circuit panel, south wall)
 *   C <- FLOW     = 270 deg  (plate above the pressure placard, east wall)
 *
 * so the player must visit all three earlier puzzles' stations and combine
 * the readings - the machine itself never displays the answer.
 *
 * Pure: no Three.js, no DOM (mirrors GearPuzzle/CircuitPuzzle/ValvePuzzle).
 */
export const KNOB_NAMES = ['A', 'B', 'C'];

/** Per-knob solution as a state 0..3 (state * 90 = degrees). */
export const KNOB_SOLUTION = [1, 2, 3];

export class FinalMachinePuzzle {
  /** @param {number[]} [solution] per-knob target state 0..3 */
  constructor(solution = KNOB_SOLUTION) {
    this.solution = [...solution];
    /** @type {number[]} current knob states; all start at 0 degrees */
    this.states = [0, 0, 0];
    this.solved = false;
  }

  /**
   * Advance one knob a quarter-turn (wraps 3 -> 0).
   * No-ops (returns false) once solved or out of range.
   * @param {number} index 0..2
   * @returns {boolean} true if the state changed
   */
  turn(index) {
    if (this.solved) return false;
    if (!Number.isInteger(index) || index < 0 || index >= this.states.length) return false;
    this.states[index] = (this.states[index] + 1) % 4;
    this.solved = this.states.every((s, i) => s === this.solution[i]);
    return true;
  }

  /** Degrees shown for a knob's current state (0, 90, 180, 270). */
  degrees(index) {
    return this.states[index] * 90;
  }

  /** How many knobs already sit on the solution - drives the hint toast. */
  get correctCount() {
    let n = 0;
    for (let i = 0; i < this.states.length; i++) {
      if (this.states[i] === this.solution[i]) n++;
    }
    return n;
  }

  reset() {
    this.states = [0, 0, 0];
    this.solved = false;
  }
}
