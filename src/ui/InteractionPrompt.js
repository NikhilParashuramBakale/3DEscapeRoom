/**
 * InteractionPrompt - the "Press E to ..." message shown under the crosshair.
 *
 * Demonstrates UI animation: the prompt scales up and fades in, and scales
 * back down when it is dismissed.
 */
export class InteractionPrompt {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.id = 'interaction-prompt';
    this.el.classList.add('hidden');
    parent.appendChild(this.el);
    this._visible = false;
  }

  show(text) {
    if (this.el.textContent !== text) this.el.textContent = text;
    if (!this._visible) {
      this._visible = true;
      this.el.classList.remove('hidden');
      // Restart the pop-in animation.
      this.el.classList.remove('pop');
      void this.el.offsetWidth; // force reflow
      this.el.classList.add('pop');
    }
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
    this.el.classList.add('hidden');
    this.el.classList.remove('pop');
  }
}
