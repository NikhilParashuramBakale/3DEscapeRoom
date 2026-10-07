/**
 * ValvePuzzle - pure logic for the pressure rig (Phase 17).
 *
 * Three valves (LEFT, CENTER, RIGHT). Each cycles through four discrete
 * orientations, mapped to handle directions: UP -> RIGHT -> DOWN -> LEFT.
 * The solution comes from the placard clue (LEFT DOWN, CENTER UP, RIGHT
 * DOWN), so the rules never spell it out - the clue does.
 *
 * Pure: no Three.js, no DOM. ValveRig reads `states` for the wheel angles,
 * Game reads `solved` / `correctCount` (mirrors GearPuzzle/CircuitPuzzle).
 */
export const VALVE_NAMES = ['Left', 'Center', 'Right'];

/** state 0..3 -> handle direction. Rotation order matches wheel spin. */
export const VALVE_DIRECTIONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

/**
 * Solution derived from the placard: LEFT -> DOWN (2), CENTER -> UP (0),
 * RIGHT -> DOWN (2).
 */
export const VALVE_SOLUTION = [2, 0, 2];

export class ValvePuzzle {
  /** @param {number[]} [solution] per-valve target state 0..3 */
  constructor(solution = VALVE_SOLUTION) {
    this.solution = [...solution];
    /** @type {number[]} current state per valve; all start pointing UP */
    this.states = [0, 0, 0];
    this.solved = false;
  }

  /**
   * Advance one valve to its next orientation (wraps 3 -> 0).
   * No-ops (returns false) once solved or out of range, so a locked rig is
   * silent rather than throwing.
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

  /** Handle direction of a valve, e.g. 'DOWN'. */
  direction(index) {
    return VALVE_DIRECTIONS[this.states[index]];
  }

  /** How many valves are already on their solution - drives the gauge hint. */
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
