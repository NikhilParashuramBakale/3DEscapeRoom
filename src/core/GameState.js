/**
 * GameState - central store of puzzle / progression flags.
 *
 * Kept intentionally tiny and framework-free: puzzles read flags, and other
 * systems can react to changes by subscribing through `on(event, handler)`.
 */
export class GameState {
  constructor() {
    // Room 1: The Forgotten Laboratory progression flags
    this.hasReadCodeSheet = false;
    this.codeSolved = false;
    this.hasKey = false;
    this.machineKeyInserted = false; // key physically seated in the east-wall lock
    this.gearPuzzleSolved = false;
    this.machineActive = false;
    this.circuitPuzzleSolved = false;
    this.valvePuzzleSolved = false;
    this.machinePuzzleSolved = false;
    this.doorUnlocked = false;
    this.escaped = false;

    // Room 2: The Proctor Chamber progression flags
    this.inRoom2 = false;            // candidate entered Room 2
    this.cppTerminalSolved = false;  // Station 01 C++ terminal solved correctly
    this.cppTerminalCurrentQuestion = 0; // index into CPP_TERMINAL_QUESTIONS
    this.terminalWrongAttempts = 0;  // incorrect attempts count (hint after 2)
    this.certificateAlpha = null;    // Certificate Alpha value: "CERTIFICATE α — VALUE: 12"
    this.certificateTaken = false;   // Certificate Alpha recorded
    this.room2DoorUnlocked = false;  // Chamber exit door (locked until future phases)

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
