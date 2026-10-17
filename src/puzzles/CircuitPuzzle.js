/**
 * CircuitPuzzle - pure logic for the electrical panel (Phase 16, hardened
 * in Phase 22, de-chained in Phase 24 by user request).
 *
 * Five channels, each ON or OFF, each throw moving ONLY its own switch.
 * (The Lights-Out style chain that tripped the NEIGHBOURING switch when
 * you pressed one lever is gone: pressing one lever used to move two
 * levers at once, and players read it as a bug.)
 *
 * The target is mask 0b10110 - green, yellow and white ON; red (damaged)
 * and blue (spare) OFF. Guidance comes from the instruments: the panel
 * toasts "n of 5 channels aligned" after every throw, the bottom bar fills
 * toward the green notch, and the needle tracks the same fraction.
 *
 * Exactly one switch configuration reaches the target (identity matrix);
 * verified by brute force in tests.
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

  /**
   * Throw a switch. Exactly one channel flips - no neighbour coupling
   * (see class docs). No-ops (returns false) when solved or out of range.
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
