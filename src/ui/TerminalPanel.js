/**
 * TerminalPanel - the modal for the Room 2 C++ compiler diagnostic.
 *
 * Shows a C++ snippet, the question, and four multiple-choice options.
 * While open the game is paused (pointer lock released, movement blocked).
 * The panel is deliberately dumb: it renders the snippet and options and
 * reports the player's choice via onSubmit. The correctness decision belongs
 * to Game, which uses checkCppTerminalAnswer() from CppTerminal.js.
 *
 * Closes on the Close button, on Escape, or on a click outside the card.
 */
export class TerminalPanel {
  constructor(parent, { player = null } = {}) {
    this.player = player;

    this.el = document.createElement('div');
    this.el.id = 'terminal-panel';
    this.el.classList.add('hidden');
    this.el.innerHTML = `
      <div class="terminal-card" role="dialog" aria-modal="true" aria-label="Terminal">
        <div class="terminal-header">
          <h2 id="terminal-title"></h2>
          <button type="button" class="terminal-close">Close (Esc)</button>
        </div>
        <pre id="terminal-snippet"></pre>
        <p id="terminal-prompt"></p>
        <div id="terminal-options"></div>
        <p id="terminal-status" class="terminal-status"></p>
      </div>
    `;
    parent.appendChild(this.el);

    this.titleEl = this.el.querySelector('#terminal-title');
    this.snippetEl = this.el.querySelector('#terminal-snippet');
    this.promptEl = this.el.querySelector('#terminal-prompt');
    this.optionsEl = this.el.querySelector('#terminal-options');
    this.statusEl = this.el.querySelector('#terminal-status');
    this.closeBtn = this.el.querySelector('.terminal-close');

    this._open = false;
    this._armed = false;
    this._submitted = false;

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
      // Number keys 1-4 map to options A-D.
      if (this._open && /^Digit[1-4]$/.test(event.code)) {
        event.preventDefault();
        const idx = Number(event.code.slice(5)) - 1;
        this._select(idx);
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  get isOpen() {
    return this._open;
  }

  /**
   * Show the diagnostic.
   * @param {{title: string, snippet: string[], prompt: string, options: {id:string,label:string}[]}} diag
   */
  open({ title, snippet, prompt, options }) {
    if (this._open) return;

    this.titleEl.textContent = title;
    this.snippetEl.textContent = snippet.join('\n');
    this.promptEl.textContent = prompt;
    this.statusEl.textContent = '';
    this._submitted = false;

    // Render option buttons.
    this.optionsEl.innerHTML = '';
    this._options = options;
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'terminal-option';
      btn.textContent = opt.label;
      btn.dataset.index = String(i);
      btn.addEventListener('click', () => this._select(i));
      this.optionsEl.appendChild(btn);
    }

    this.el.classList.remove('hidden');
    this.el.classList.remove('open');
    void this.el.offsetWidth;
    this.el.classList.add('open');
    this._open = true;
    requestAnimationFrame(() => {
      if (this._open) this._armed = true;
    });

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
    this._submitted = false;
    this.el.classList.add('hidden');
    this.el.classList.remove('open');

    if (this.player) {
      this.player.setBlocked(false);
    }

    this.onClose && this.onClose();
  }

  _select(index) {
    if (!this._open || this._submitted) return;
    this._submitted = true;
    const id = this._options[index].id;
    this.onSubmit && this.onSubmit(id);
  }

  /** Reset the submitted lock so the player can attempt again. */
  reset() {
    this._submitted = false;
  }
}
