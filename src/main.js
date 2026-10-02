import './styles/main.css';
import { Game } from './core/Game.js';

/** Small helper around the static DOM elements in index.html. */
const ui = {
  bootOverlay: document.getElementById('boot-overlay'),
  bootStatus: document.getElementById('boot-status'),
  debugPanel: document.getElementById('debug-panel'),
  debugFps: document.getElementById('debug-fps'),
  debugInfo: document.getElementById('debug-info'),

  setStatus(text) {
    this.bootStatus.textContent = text;
  },

  fadeOutBoot() {
    this.bootOverlay.classList.add('faded');
  },

  showDebug(visible) {
    this.debugPanel.classList.toggle('hidden', !visible);
  },

  setDebug(fpsText, infoText) {
    this.debugFps.textContent = fpsText;
    this.debugInfo.textContent = infoText;
  },

  fatal(message) {
    this.bootOverlay.classList.remove('faded');
    this.bootStatus.textContent = message;
    this.bootStatus.style.color = '#ff7a7a';
    this.showDebug(false);
  },
};

function bootstrap() {
  const game = new Game(document.getElementById('scene-canvas'), ui);
  game.init().catch((err) => {
    console.error(err);
    ui.fatal(`Startup failed: ${err.message}`);
  });
  // Expose for debugging / viva demonstrations.
  window.game = game;
}

bootstrap();
