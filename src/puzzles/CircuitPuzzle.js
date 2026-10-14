/**
 * CircuitPuzzle - pure logic for the electrical panel (Phase 16, hardened
 * in Phase 22).
 *
 * Five channels, each ON or OFF. The target is still the note's
 * configuration (mask 0b10110: green, yellow, white ON), but the switches
 * are CHAINED: throwing switch i also trips switch i+1 (Lights-Out style).
 * That makes the puzzle interdependent - naively setting every channel the
 * note names lands on the WRONG state, and the player must reason about
 * which presses combine to the target.
 *
 * Wiring matrix is lower-triangular with 1s on the diagonal (press i flips
 * i, and i+1 when it exists), so it is invertible over GF(2):
 *   - every target state is reachable, and
 *   - exactly one press-subset reaches it (verified by brute force in tests).
 *
 * Pure: no Three.js, no DOM. CircuitPanel reads from here for visuals.
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

  /** Flip one switch directly (no chaining). Used by the wiring rule. */
  _flip(index) {
    this.switches[index] = !this.switches[index];
  }

  /**
   * Throw a switch. The chained neighbour flips with it (see class docs).
   * No-ops (returns false) when solved or out of range.
   * @param {number} index 0..4
   * @returns {boolean} true if the state changed
   */
  toggle(index) {
    if (this.solved) return false;
    if (!Number.isInteger(index) || index < 0 || index >= this.switches.length) return false;

    this._flip(index);
    // Chain rule: every switch also trips the one to its right.
    // The last switch has no right-hand neighbour.
    if (index + 1 < this.switches.length) this._flip(index + 1);

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
