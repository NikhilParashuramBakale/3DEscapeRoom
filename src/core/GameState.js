/**
 * GameState - central store of puzzle / progression flags.
 *
 * Kept intentionally tiny and framework-free: puzzles read flags, and other
 * systems can react to changes by subscribing through `on(event, handler)`.
 */
export class GameState {
  constructor() {
    // Progression flags
    this.hasReadCodeSheet = false;
    this.codeSolved = false;
    this.hasKey = false;
    this.gearPuzzleSolved = false;
    this.machineActive = false;
    this.circuitPuzzleSolved = false;
    this.valvePuzzleSolved = false;
    this.machinePuzzleSolved = false;
    this.doorUnlocked = false;
    this.escaped = false;

    this._listeners = new Map();
  }

  /** Subscribe to a state event. Returns an unsubscribe function. */
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const list = this._listeners.get(event);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i !== -1) list.splice(i, 1);
  }

  /** Set a flag and notify listeners if the value actually changed. */
  set(event, value = true) {
    if (this[event] === value) return;
    this[event] = value;
    const list = this._listeners.get(event);
    if (list) for (const handler of [...list]) handler(value, this);
  }

  emit(event, payload) {
    const list = this._listeners.get(event);
    if (list) for (const handler of [...list]) handler(payload, this);
  }
}
