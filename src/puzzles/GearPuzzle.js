/**
 * GearPuzzle - the alignment logic for the machine's three gears (Phase 8).
 *
 * Deliberately pure: no Three.js, no DOM. The machine's meshes read their
 * angles from here, which keeps the puzzle itself unit-testable and stops the
 * rules from being smeared across visual code.
 *
 * How meshing gears work, and why it matters here:
 *   Two meshed gears ALWAYS counter-rotate, and they always move by whole
 *   teeth. So gear A turning one tooth forces gear B to turn exactly one tooth
 *   too, no matter how many teeth each has. (The visible rotation *angle* is
 *   what differs by ratio - 360/N per tooth.) That is why this puzzle counts
 *   in TEETH rather than degrees: the counts stay exact integers, so a solution
 *   always exists and the player can reason it out.
 *
 * The player turns gear 0 only. Gears 1 and 2 follow automatically, which is
 * what makes it a puzzle rather than three separate dials.
 */
export class GearPuzzle {
  /**
   * @param {object} opts
   * @param {number[]} opts.teeth        tooth count per gear (visual size)
   * @param {number[]} opts.targets      required tooth offset per gear
   */
  constructor({ teeth = [12, 18, 12], targets = [0, 6, 0] } = {}) {
    this.teeth = teeth;
    this.targets = targets;
    this.solved = false;
    /** Current tooth offset per gear. Gear 0 is the driver. */
    this.offsets = teeth.map(() => 0);
  }

  /**
   * Turn the driver gear forward by one tooth.
   * @param {number} direction +1 or -1
   */
  turn(direction = 1) {
    if (this.solved) return false;

    const a = this.offsets[0] + direction;
    // Adjacent gears counter-rotate, one tooth for one tooth.
    this.offsets[0] = a;
    this.offsets[1] = -a;
    this.offsets[2] = a;

    this._checkSolved();
    return true;
  }

  _checkSolved() {
    this.solved = this.offsets.every((offset, i) => this._normalise(offset, this.teeth[i]) === this.targets[i]);
  }

  /** Wrap a tooth offset into the gear's own 0..teeth-1 range. */
  _normalise(value, teeth) {
    return ((value % teeth) + teeth) % teeth;
  }

  /**
   * Visual rotation in radians for gear `i`.
   *
   * Turns are expressed in teeth, so the angle is offset * 2PI/teeth - which
   * makes bigger gears visibly turn further for the same tooth count, exactly
   * as real meshed gears do.
   */
  angleFor(i) {
    return (this.offsets[i] * Math.PI * 2) / this.teeth[i];
  }

  /** How many gears are currently aligned - used for the "2 of 3" hint. */
  get alignedCount() {
    return this.offsets.reduce(
      (n, offset, i) => n + (this._normalise(offset, this.teeth[i]) === this.targets[i] ? 1 : 0),
      0
    );
  }

  reset() {
    this.offsets = this.teeth.map(() => 0);
    this.solved = false;
  }
}