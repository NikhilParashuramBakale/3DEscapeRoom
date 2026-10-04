/**
 * SettingsPanel - pause / options overlay (Phase 13).
 *
 * Reached with Esc or the gear icon, this is the first modal that is not part of
 * a puzzle, so it also doubles as the controls reference. Before this the only
 * way to learn the key bindings was to read the source, which is not something
 * a marker can do.
 *
 * Settings persist to localStorage so a reload does not throw them away. Every
 * storage access is defensive: localStorage throws in private mode in some
 * browsers and when disabled, and a settings menu must never be the thing that
 * crashes the game.
 */
export class SettingsPanel {
  /**
   * @param {HTMLElement} parent usually #app
   * @param {object} opts
   * @param {import('../player/PlayerController.js').PlayerController} [opts.player]
   * @param {(key: string, value: number|boolean) => void} [opts.onChange]
   * @param {() => void} [opts.onResume]
   */
  constructor(parent, { player = null, onChange = null, onResume = null } = {}) {
    this.player = player;
    this.onChange = onChange;
    this.onResume = onResume;

    this.el = document.createElement('div');
    this.el.id = 'settings-panel';
    this.el.classList.add('hidden');
    this.el.innerHTML = `
      <div class="settings-card" role="dialog" aria-modal="true" aria-label="Settings">
        <h2>Settings</h2>

        <div class="settings-row">
          <label for="set-sensitivity">Mouse sensitivity</label>
          <input id="set-sensitivity" type="range" min="0.2" max="3" step="0.1" />
          <output class="settings-value" data-for="set-sensitivity">1.0</output>
        </div>

        <div class="settings-row">
          <label for="set-fov">Field of view</label>
          <input id="set-fov" type="range" min="60" max="100" step="1" />
          <output class="settings-value" data-for="set-fov">75</output>
        </div>

        <div class="settings-row">
          <label for="set-volume">Volume</label>
          <input id="set-volume" type="range" min="0" max="1" step="0.05" />
          <output class="settings-value" data-for="set-volume">70%</output>
        </div>

        <div class="settings-row settings-toggle-row">
          <label for="set-shadows">Shadows</label>
          <input id="set-shadows" type="checkbox" checked />
        </div>

        <div class="settings-controls">
          <h3>Controls</h3>
          <ul>
            <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Move</span></li>
            <li><kbd>Mouse</kbd><span>Look</span></li>
            <li><kbd>E</kbd><span>Interact</span></li>
            <li><kbd>M</kbd><span>Toggle sound</span></li>
            <li><kbd>Esc</kbd><span>Settings / release cursor</span></li>
          </ul>
        </div>

        <button type="button" class="settings-resume">Resume</button>
      </div>
    `;
    parent.appendChild(this.el);

    this._open = false;

    this.sensitivityEl = this.el.querySelector('#set-sensitivity');
    this.fovEl = this.el.querySelector('#set-fov');
    this.volumeEl = this.el.querySelector('#set-volume');
    this.shadowsEl = this.el.querySelector('#set-shadows');
    this.resumeBtn = this.el.querySelector('.settings-resume');

    this.resumeBtn.addEventListener('click', () => this.close());

    // 'input' fires continuously while dragging, 'change' only on release.
    // Update the readout on input so it tracks the thumb, but only report the
    // value on change so the renderer is not rebuilt on every mouse move.
    this.sensitivityEl.addEventListener('input', () => {
      this._setValue('set-sensitivity', Number(this.sensitivityEl.value).toFixed(1));
    });
    this.sensitivityEl.addEventListener('change', () => {
      this._emit('sensitivity', Number(this.sensitivityEl.value));
    });
    this.fovEl.addEventListener('input', () => {
      this._setValue('set-fov', String(this.fovEl.value));
    });
    this.fovEl.addEventListener('change', () => this._emit('fov', Number(this.fovEl.value)));
    this.volumeEl.addEventListener('input', () => {
      this._setValue('set-volume', `${Math.round(this.volumeEl.value * 100)}%`);
    });
    this.volumeEl.addEventListener('change', () => this._emit('volume', Number(this.volumeEl.value)));
    this.shadowsEl.addEventListener('change', () => this._emit('shadows', this.shadowsEl.checked));

    // Clicking the backdrop closes; clicking the card must not, or every
    // adjustment would dismiss the panel.
    this.el.addEventListener('click', (event) => {
      if (event.target === this.el) this.close();
    });
  }

  get isOpen() {
    return this._open;
  }

  open({ paused = false } = {}) {
    if (this._open) return;
    this._open = true;
    this.el.classList.remove('hidden');
    void this.el.offsetWidth;
    this.el.classList.add('open');
    // The pointer has to be released for the sliders to be usable at all.
    if (this.player && this.player.controls.isLocked) this.player.controls.unlock();
    this.el.classList.toggle('paused', !!paused);
    this.resumeBtn.focus();
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this.el.classList.add('hidden');
    this.el.classList.remove('open', 'paused');
    this.onResume && this.onResume();
  }

  /** Reflect a settings object into the controls (used on load). */
  applySettings(s) {
    if (s.sensitivity !== undefined) {
      this.sensitivityEl.value = s.sensitivity;
      this._setValue('set-sensitivity', Number(s.sensitivity).toFixed(1));
    }
    if (s.fov !== undefined) {
      this.fovEl.value = s.fov;
      this._setValue('set-fov', String(s.fov));
    }
    if (s.volume !== undefined) {
      this.volumeEl.value = s.volume;
      this._setValue('set-volume', `${Math.round(s.volume * 100)}%`);
    }
    if (s.shadows !== undefined) this.shadowsEl.checked = !!s.shadows;
  }

  _setValue(forId, text) {
    const out = this.el.querySelector(`output[data-for="${forId}"]`);
    if (out) out.textContent = text;
  }

  _emit(key, value) {
    if (this.onChange) this.onChange(key, value);
  }
}

/** localStorage key for the persisted settings blob. */
const STORAGE_KEY = 'forgotten-lab.settings';

/** Defaults, also used to fill in any key a saved file is missing. */
export const DEFAULT_SETTINGS = { sensitivity: 1, fov: 75, volume: 0.7, shadows: true };

/**
 * Read persisted settings.
 *
 * Every access is guarded: Safari private mode throws on localStorage, and a
 * thrown settings read would take the whole game down before it starts.
 * @returns {object} settings with defaults filled in
 */
export function loadSettings() {
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    // Merge rather than replace, so a file saved by an older build (missing
    // keys added later) still loads instead of yielding undefined everywhere.
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist settings. Silently gives up if storage is unavailable. */
export function saveSettings(settings) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
