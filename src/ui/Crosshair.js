/**
 * Crosshair - the Minecraft-style aiming point drawn in the centre of the
 * screen. Built from two CSS pseudo-elements (one vertical bar, one
 * horizontal bar) so no extra DOM nodes or textures are needed.
 *
 * The crosshair can be highlighted when the player is looking at an
 * interactive object (see InteractionManager, Phase 4).
 */
export class Crosshair {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.id = 'crosshair';
    this.el.innerHTML = '<span class="ch-v"></span><span class="ch-h"></span>';
    parent.appendChild(this.el);
  }

  /** Green highlight when a raycast hits something interactive. */
  setActive(active) {
    this.el.classList.toggle('active', !!active);
  }

  setVisible(visible) {
    this.el.classList.toggle('hidden', !visible);
  }
}
