/**
 * CircuitPuzzle - pure logic for the electrical panel (Phase 16).
 *
 * Five channels, each ON or OFF. The solution is expressed as a bit mask so
 * the wiring note determines it without the code spelling it out: number the
 * switches 1..5 left to right and only SOME of them may carry power.
 *
 * Pure: no Three.js, no DOM. CircuitPanel reads from here for visuals, which
 * keeps the rules unit-testable (mirrors GearPuzzle.js).
 */
export const CIRCUIT_SOLUTION_MASK = 0b10110;

// Switch index -> physical channel colour. Red is the damaged one.
export const CIRCUIT_CHANNELS = ['red', 'green', 'yellow', 'blue', 'white'];

export class CircuitPuzzle {
  /**
   * @param {number} solution bit mask; bit i (LSB = switch 1) is the required state
   */
  constructor(solution = CIRCUIT_SOLUTION_MASK) {
    this.solution = solution;
    /** @type {boolean[]} switch states, all start OFF */
    this.switches = [false, false, false, false, false];
    this.solved = false;
  }

  /**
   * Flip a switch. No-ops (returns false) when solved or out of range, so a
   * locked panel is silent rather than throwing.
   * @param {number} index 0..4
   * @returns {boolean} true if the state changed
   */
  toggle(index) {
    if (this.solved) return false;
    if (!Number.isInteger(index) || index < 0 || index >= this.switches.length) return false;
    this.switches[index] = !this.switches[index];
    this.solved = this._checkSolved();
    return true;
  }

  _checkSolved() {
    for (let i = 0; i < this.switches.length; i++) {
      const want = ((this.solution >> i) & 1) === 1;
      if (this.switches[i] !== want) return false;
    }
    return true;
  }

  /** How many switches currently match - drives the "3 of 5 channels live" hint. */
  get correctCount() {
    let n = 0;
    for (let i = 0; i < this.switches.length; i++) {
      const want = ((this.solution >> i) & 1) === 1;
      if (this.switches[i] === want) n++;
    }
    return n;
  }

  /** Current states as a bit mask (switch 1 = LSB). */
  get mask() {
    let m = 0;
    for (let i = 0; i < this.switches.length; i++) {
      if (this.switches[i]) m |= 1 << i;
    }
    return m;
  }

  reset() {
    this.switches = [false, false, false, false, false];
    this.solved = false;
  }
}
