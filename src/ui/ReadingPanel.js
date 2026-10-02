/**
 * ReadingPanel - the modal that shows a readable document (Phase 5).
 *
 * While it is open the game must not react to movement keys or the E key, and
 * the player needs a visible cursor to click the Close button. Both of those
 * are delegated to the PlayerController so this class stays purely UI.
 *
 * Closes on the Close button, on Escape, or on a click outside the document.
 */
export class ReadingPanel {
  /**
   * @param {HTMLElement} parent  usually #app
   * @param {object} opts
   * @param {import('../player/PlayerController.js').PlayerController} [opts.player]
   */
  constructor(parent, { player = null } = {}) {
    this.player = player;

    this.el = document.createElement('div');
    this.el.id = 'reading-panel';
    this.el.classList.add('hidden');
    this.el.innerHTML = `
      <div class="reading-card" role="dialog" aria-modal="true" aria-labelledby="reading-title">
        <h2 id="reading-title"></h2>
        <pre class="reading-body"></pre>
        <p class="reading-hint"></p>
        <button type="button" class="reading-close">Close (Esc)</button>
      </div>
    `;
    parent.appendChild(this.el);

    this.titleEl = this.el.querySelector('.reading-card h2');
    this.bodyEl = this.el.querySelector('.reading-body');
    this.hintEl = this.el.querySelector('.reading-hint');
    this.closeBtn = this.el.querySelector('.reading-close');

    this._open = false;
    // Opening the panel releases pointer lock, and the browser can deliver a
    // pointerdown around the same moment the modal appears. Without this guard
    // that stray press lands on the backdrop and instantly dismisses the
    // document the player just asked to read. Clicks are ignored for one
    // animation frame after opening.
    this._armed = false;

    // A click that misses the card dismisses it, matching normal dialog habits.
    this.el.addEventListener('pointerdown', (event) => {
      if (!this._armed) return;
      if (event.target === this.el) this.close();
    });
    this.closeBtn.addEventListener('click', () => this.close());

    this._onKeyDown = (event) => {
      if (this._open && event.code === 'Escape') {
        event.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  get isOpen() {
    return this._open;
  }

  /**
   * Show a document.
   * @param {{title: string, lines: string[], hint?: string}} doc
   */
  open({ title, lines, hint = '' }) {
    if (this._open) return;

    this.titleEl.textContent = title;
    // A trailing empty line in the source would add a stray blank row, so trim.
    const trimmed = [...lines];
    while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop();
    this.bodyEl.textContent = trimmed.join('\n');
    this.hintEl.textContent = hint;
    this.hintEl.classList.toggle('hidden', !hint);

    this.el.classList.remove('hidden');
    // Restart the fade/scale-in animation.
    this.el.classList.remove('open');
    void this.el.offsetWidth;
    this.el.classList.add('open');
    this._open = true;
    // Arm backdrop-dismissal on the next frame (see `_armed`).
    requestAnimationFrame(() => {
      if (this._open) this._armed = true;
    });

    // Freeze the game and free the cursor.
    if (this.player) {
      this.player.setBlocked(true);
      if (this.player.controls.isLocked) this.player.controls.unlock();
    }

    this.closeBtn.focus();

    this.onOpen && this.onOpen();
  }

  close() {
    if (!this._open) return;

    this._open = false;
    this._armed = false;
    this.el.classList.add('hidden');
    this.el.classList.remove('open');

    if (this.player) {
      this.player.setBlocked(false);
      // Pointer lock can only be re-acquired from a user gesture, so clicking
      // the canvas (the existing PlayerController handler) takes over from here.
    }

    this.onClose && this.onClose();
  }
}