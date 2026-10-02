/**
 * KeypadPanel - the on-screen numeric keypad (Phase 7).
 *
 * Opening it pauses player control and frees the cursor, matching
 * ReadingPanel. The panel is deliberately dumb: it reports key presses to the
 * caller and never decides whether a code is correct - that logic belongs to
 * the Keypad object, which owns the solution.
 *
 * Supports clicking, the mouse wheel-free number row, and the physical
 * number keys, so a player can type either way.
 */
export class KeypadPanel {
  /**
   * @param {HTMLElement} parent usually #app
   * @param {object} opts
   * @param {import('../player/PlayerController.js').PlayerController} [opts.player]
   */
  constructor(parent, { player = null } = {}) {
    this.player = player;

    this.el = document.createElement('div');
    this.el.id = 'keypad-panel';
    this.el.classList.add('hidden');
    this.el.innerHTML = `
      <div class="keypad-card" role="dialog" aria-modal="true" aria-label="Keypad">
        <h2>Pedestal Keypad</h2>
        <div class="keypad-readout" aria-live="polite"></div>
        <p class="keypad-status"></p>
        <div class="keypad-grid"></div>
        <button type="button" class="keypad-close">Close (Esc)</button>
      </div>
    `;
    parent.appendChild(this.el);

    this.readoutEl = this.el.querySelector('.keypad-readout');
    this.statusEl = this.el.querySelector('.keypad-status');
    this.gridEl = this.el.querySelector('.keypad-grid');
    this.closeBtn = this.el.querySelector('.keypad-close');

    // Layout mirrors the physical prop: 1-9 then C / 0 / OK.
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
    for (const key of keys) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `keypad-key${key === 'OK' ? ' ok' : ''}${key === 'C' ? ' clear' : ''}`;
      btn.textContent = key;
      btn.dataset.key = key;
      btn.addEventListener('click', () => this._press(key));
      this.gridEl.appendChild(btn);
    }

    this._open = false;
    this._entry = '';

    this.closeBtn.addEventListener('click', () => this.close());

    this._onKeyDown = (event) => {
      if (!this._open) return;
      if (event.code === 'Escape') {
        event.preventDefault();
        this.close();
        return;
      }
      if (/^Digit[0-9]$/.test(event.code)) {
        event.preventDefault();
        this._press(event.code.slice(5));
      } else if (event.code === 'Enter') {
        event.preventDefault();
        this._press('OK');
      } else if (event.code === 'Backspace' || event.code === 'Delete') {
        event.preventDefault();
        this._press('C');
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  get isOpen() {
    return this._open;
  }

  /**
   * Show the keypad.
   * @param {{title?: string, prompt?: string}} [opts]
   */
  open({ title = 'Pedestal Keypad', prompt = '' } = {}) {
    if (this._open) return;

    this.el.querySelector('h2').textContent = title;
    this._entry = '';
    this._render();
    this.setStatus(prompt);

    this.el.classList.remove('hidden');
    void this.el.offsetWidth;
    this.el.classList.add('open');
    this._open = true;

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
    this._entry = '';
    this.el.classList.add('hidden');
    this.el.classList.remove('open');

    if (this.player) this.player.setBlocked(false);

    this.onClose && this.onClose();
  }

  /** Route a key press; the caller owns what happens next. */
  _press(key) {
    if (key === 'C') {
      this._entry = '';
      this._render();
    } else if (key === 'OK') {
      this.onSubmit && this.onSubmit(this._entry);
    } else {
      this._entry += key;
      this._render();
    }
    this.onKey && this.onKey(key);
  }

  /** Masked readout, mirroring the prop's own display. */
  _render() {
    const text = this._entry.length ? '*'.repeat(this._entry.length) : '---';
    if (this.readoutEl.textContent !== text) this.readoutEl.textContent = text;
  }

  /** Set the hint / feedback line under the readout. */
  setStatus(text) {
    if (this.statusEl.textContent !== (text || '')) this.statusEl.textContent = text || '';
  }

  /**
   * Flash the readout red after a wrong code. Called by Game when the Keypad
   * object rejects an entry.
   */
  reject() {
    this.readoutEl.classList.remove('shake');
    void this.readoutEl.offsetWidth;
    this.readoutEl.classList.add('shake');
  }
}