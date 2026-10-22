/**
 * TerminalPanel - Modal interface for the Room 2 C++ compiler diagnostic terminal.
 *
 * Displays the examination C++ snippet, question prompt, multiple-choice options,
 * status message, and progressive hint after incorrect attempts.
 *
 * Manages pointer-lock release and cursor freedom while open, restoring camera
 * control cleanly when closed.
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
          <h2 id="terminal-title">PROCTOR CHAMBER — EXAMINATION TERMINAL 01</h2>
          <button type="button" class="terminal-close">Close (Esc)</button>
        </div>
        <p id="terminal-prompt" class="terminal-prompt"></p>
        <pre id="terminal-snippet"></pre>
        <div id="terminal-options"></div>
        <p id="terminal-status" class="terminal-status"></p>
        <p id="terminal-hint" class="terminal-hint"></p>
      </div>
    `;
    parent.appendChild(this.el);

    this.titleEl = this.el.querySelector('#terminal-title');
    this.snippetEl = this.el.querySelector('#terminal-snippet');
    this.promptEl = this.el.querySelector('#terminal-prompt');
    this.optionsEl = this.el.querySelector('#terminal-options');
    this.statusEl = this.el.querySelector('#terminal-status');
    this.hintEl = this.el.querySelector('#terminal-hint');
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
      // Number keys 1-4 map to options A-D
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
   * Populate the panel content with a question's data.
   * Extracted so open() and setQuestion() share the same wiring.
   * @param {{title: string, snippet: string[], prompt: string, options: {id:string,label:string}[]}} diag
   */
  _renderContent({ title, snippet, prompt, options }) {
    if (title) this.titleEl.textContent = title;
    this.snippetEl.textContent = Array.isArray(snippet) ? snippet.join('\n') : String(snippet);
    this.promptEl.textContent = prompt || '';
    this.statusEl.textContent = '';
    this.statusEl.className = 'terminal-status';
    if (this.hintEl) {
      this.hintEl.textContent = '';
      this.hintEl.style.display = 'none';
      this.hintEl.style.color = '';
    }
    this._submitted = false;

    // Render option buttons
    this.optionsEl.innerHTML = '';
    this._options = options || [];
    for (let i = 0; i < this._options.length; i++) {
      const opt = this._options[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'terminal-option';
      btn.textContent = opt.label;
      btn.dataset.index = String(i);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._select(i);
      });
      this.optionsEl.appendChild(btn);
    }
  }

  /**
   * Display the diagnostic (first open).
   * @param {{title: string, snippet: string[], prompt: string, options: {id:string,label:string}[]}} diag
   */
  open({ title, snippet, prompt, options }) {
    if (this._open) return;
    this._renderContent({ title, snippet, prompt, options });

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
      if (this.player.controls && this.player.controls.isLocked) {
        this.player.controls.unlock();
      }
    }

    this.closeBtn.focus();
    this.onOpen && this.onOpen();
  }

  /**
   * Swap to a different question without closing the panel.
   * Used when the player answers correctly and a next question is available.
   * @param {{title: string, snippet: string[], prompt: string, options: {id:string,label:string}[]}} diag
   */
  setQuestion({ title, snippet, prompt, options }) {
    if (!this._open) return;
    this._renderContent({ title, snippet, prompt, options });
    this.closeBtn.focus();
    this.onQuestionAdvance && this.onQuestionAdvance();
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
    if (!this._open || this._submitted || !this._options[index]) return;
    this._submitted = true;
    const id = this._options[index].id;
    this.onSubmit && this.onSubmit(id);
  }

  /** Display error warning and optional progressive hint. */
  showError(message, hint = null) {
    this.statusEl.textContent = message;
    this.statusEl.className = 'terminal-status error';
    if (hint && this.hintEl) {
      this.hintEl.textContent = 'HINT: ' + hint;
      this.hintEl.style.display = 'block';
    }
  }

  /** Display success state with certificate text. */
  showSuccess(message, certText = '') {
    this.statusEl.textContent = message;
    this.statusEl.className = 'terminal-status success';
    if (this.hintEl && certText) {
      this.hintEl.textContent = certText;
      this.hintEl.style.display = 'block';
      this.hintEl.style.color = '#7ff0d8';
    }
  }

  /** Reset the submitted lock so the player can attempt again immediately. */
  reset() {
    this._submitted = false;
  }
}
