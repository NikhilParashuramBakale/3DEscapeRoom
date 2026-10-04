/**
 * EndScreen - the completion overlay shown once the player escapes (Phase 10).
 *
 * Pure UI, like the other panels: it never touches game state and never
 * decides when the game is won. Game decides that (it owns the escape check)
 * and calls `show(stats)`. The overlay then blocks player control, releases
 * the pointer so the button is clickable, and shows a summary of the run.
 *
 * The panel is intentionally un-closeable. The game is over; offering a "keep
 * playing" would leave the player standing in an unbounded corridor with every
 * objective already complete and nothing left to do.
 */
export class EndScreen {
  /**
   * @param {HTMLElement} parent usually #app
   * @param {object} opts
   * @param {import('../player/PlayerController.js').PlayerController} [opts.player]
   * @param {() => void} [opts.onRestart] called when the player asks to play again
   */
  constructor(parent, { player = null, onRestart = null } = {}) {
    this.player = player;
    this.onRestart = onRestart;

    this.el = document.createElement('div');
    this.el.id = 'end-screen';
    this.el.classList.add('hidden');
    this.el.innerHTML = `
      <div class="end-card" role="dialog" aria-modal="true" aria-label="You escaped">
        <h1 class="end-title">ESCAPED</h1>
        <p class="end-flavor">
          The corridor swallows the light behind you. Whatever the machine was
          building, it is still building it without you.
        </p>
        <dl class="end-stats">
          <div class="end-stat"><dt>Time</dt><dd class="end-stat-time">&mdash;</dd></div>
          <div class="end-stat"><dt>Gear turns</dt><dd class="end-stat-turns">&mdash;</dd></div>
          <div class="end-stat"><dt>Objectives</dt><dd class="end-stat-objectives">&mdash;</dd></div>
        </dl>
        <button type="button" class="end-restart">Play again</button>
      </div>
    `;
    parent.appendChild(this.el);

    this.timeEl = this.el.querySelector('.end-stat-time');
    this.turnsEl = this.el.querySelector('.end-stat-turns');
    this.objectivesEl = this.el.querySelector('.end-stat-objectives');
    this.restartBtn = this.el.querySelector('.end-restart');

    this._open = false;
    this.restartBtn.addEventListener('click', () => {
      if (this.onRestart) this.onRestart();
    });

    // Enter or Space re-triggers the focused button; guard against a held key
    // reopening anything, since this screen never closes.
    this._onKeyDown = (event) => {
      if (!this._open) return;
      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        this.restartBtn.click();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  get isOpen() {
    return this._open;
  }

  /**
   * Reveal the completion screen.
   * @param {{seconds?: number, gearTurns?: number, objectivesDone?: number, objectivesTotal?: number}} [stats]
   */
  show({ seconds = 0, gearTurns = 0, objectivesDone = 0, objectivesTotal = 0 } = {}) {
    if (this._open) return;

    this.timeEl.textContent = formatDuration(seconds);
    this.turnsEl.textContent = String(gearTurns);
    this.objectivesEl.textContent = `${objectivesDone} / ${objectivesTotal}`;

    this.el.classList.remove('hidden');
    // Restart the entry animation if the player reloads into a new run.
    void this.el.offsetWidth;
    this.el.classList.add('open');
    this._open = true;

    if (this.player) {
      this.player.setBlocked(true);
      if (this.player.controls.isLocked) this.player.controls.unlock();
    }
    this.restartBtn.focus();
  }
}

/**
 * Seconds as m:ss, or h:mm:ss past an hour.
 *
 * The floor is applied separately at each step so 119.9 s reads as 1:59 rather
 * than rounding up to 2:00.
 */
export function formatDuration(seconds) {
  // NaN/Infinity must not reach the display: Math.floor would pass NaN
  // straight through Math.max and the card would read "NaN:NaN".
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}