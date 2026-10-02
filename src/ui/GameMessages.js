/**
 * GameMessages - player-facing text: transient toasts and the current objective.
 *
 * Replaces the single-shot `ui.flash()` toast. Two things are added:
 *
 *  1. A queue. Several events can fire in the same frame (picking up a note
 *     while a drawer opens, say) and the old implementation let the last call
 *     overwrite the previous text, so the player lost messages entirely.
 *     Messages now stack and expire one at a time.
 *
 *  2. Objectives derived from GameState. Progress is declared as data
 *     (see OBJECTIVES) and the panel picks the first not-yet-completed entry,
 *     so no system has to remember to call `setObjective` by hand.
 */
export class GameMessages {
  /**
   * @param {HTMLElement} parent usually #app
   * @param {import('../core/GameState.js').GameState} state
   */
  constructor(parent, state) {
    this.state = state;

    // ---- Toast stack -------------------------------------------------
    // Each message gets its own element so several can be visible at once.
    this.stack = document.createElement('div');
    this.stack.id = 'message-stack';
    parent.appendChild(this.stack);
    this._messages = [];

    // ---- Objective tracker ------------------------------------------
    this.objectiveEl = document.createElement('div');
    this.objectiveEl.id = 'objective-tracker';
    this.objectiveEl.innerHTML = `
      <span class="objective-label">Objective</span>
      <span class="objective-text"></span>
    `;
    parent.appendChild(this.objectiveEl);
    this._objectiveTextEl = this.objectiveEl.querySelector('.objective-text');

    this._refreshObjective();
    for (const entry of OBJECTIVES) this.state.on(entry.flag, () => this._refreshObjective());
  }

  /**
   * Queue a transient message.
   * @param {string} text
   * @param {{duration?: number, tone?: 'info'|'good'|'bad'}} [opts]
   */
  flash(text, { duration = 2600, tone = 'info' } = {}) {
    if (!text) return;

    const el = document.createElement('div');
    el.className = `message-toast tone-${tone}`;
    el.textContent = text;
    this.stack.appendChild(el);

    // Restart the entry animation on every message.
    void el.offsetWidth;
    el.classList.add('show');

    const entry = { el, duration };
    this._messages.push(entry);

    // A hard cap so a burst of events cannot flood the screen.
    while (this._messages.length > MAX_VISIBLE) {
      this._dismiss(this._messages[0]);
    }
  }

  /** Remove the oldest message immediately. */
  _dismiss(entry) {
    const i = this._messages.indexOf(entry);
    if (i !== -1) this._messages.splice(i, 1);
    entry.el.classList.remove('show');
    // Let the fade-out transition finish before detaching the node.
    setTimeout(() => entry.el.remove(), MESSAGE_FADE_MS);
  }

  /**
   * Per-frame expiry. Driven by the game loop rather than one timer per
   * message so pausing the game also pauses the text.
   * @param {number} dt seconds
   */
  update(dt) {
    if (this._messages.length === 0) return;
    this._clock = (this._clock || 0) + dt;

    while (this._messages.length) {
      const oldest = this._messages[0];
      oldest.duration -= dt * 1000;
      if (oldest.duration > 0) break;
      this._dismiss(oldest);
    }
  }

  /** Recompute the objective line from the progression flags. */
  _refreshObjective() {
    const current = OBJECTIVES.find((o) => !this.state[o.flag]);
    // When everything is done, OBJECTIVES' final entry reads as the win state.
    const text = current ? current.text : OBJECTIVES[OBJECTIVES.length - 1].doneText;
    if (this._objectiveTextEl.textContent !== text) {
      this._objectiveTextEl.textContent = text;
      this.objectiveEl.classList.remove('pulse');
      void this.objectiveEl.offsetWidth;
      this.objectiveEl.classList.add('pulse');
    }
  }

  /** Hide all transient messages, e.g. when a modal takes over the screen. */
  clear() {
    while (this._messages.length) this._dismiss(this._messages[0]);
  }
}

/** Fade-out duration, must match the CSS transition on `.message-toast`. */
const MESSAGE_FADE_MS = 300;

/** How many toasts may be stacked before the oldest is pushed out. */
const MAX_VISIBLE = 3;

/**
 * The objective chain, in order. The first entry whose flag is still false is
 * the player's current objective; `doneText` is shown once all are complete.
 *
 * Only flags that exist today are listed - later phases append their own
 * entries here rather than editing the UI.
 */
export const OBJECTIVES = [
  { flag: 'hasReadCodeSheet', text: 'Find the lab note on the desk.' },
  { flag: 'codeSolved', text: 'Work out the code and use the pedestal keypad.' },
  { flag: 'hasKey', text: 'Open the desk drawer and take the key.' },
  { flag: 'gearPuzzleSolved', text: 'Restore power to the machine on the east wall.' },
  { flag: 'doorUnlocked', text: 'Unlock the exit door and escape.' },
  { flag: 'escaped', text: '', doneText: 'Escaped.' },
];