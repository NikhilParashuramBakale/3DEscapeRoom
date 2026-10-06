import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { GameState } from './GameState.js';
import { PlayerController } from '../player/PlayerController.js';
import { Laboratory } from '../environment/Laboratory.js';
import { Crosshair } from '../ui/Crosshair.js';
import { InteractionPrompt } from '../ui/InteractionPrompt.js';
import { InteractionManager } from '../interaction/InteractionManager.js';
import { ReadingPanel } from '../ui/ReadingPanel.js';
import { GameMessages } from '../ui/GameMessages.js';
import { KeypadPanel } from '../ui/KeypadPanel.js';
import { EndScreen } from '../ui/EndScreen.js';
import { OBJECTIVES } from '../ui/GameMessages.js';
import { AudioManager } from '../audio/AudioManager.js';
import { SettingsPanel, loadSettings, saveSettings } from '../ui/SettingsPanel.js';
import { CODE_SHEET_LINES, CODE_SHEET_TITLE, CODE_SHEET_HINT } from '../puzzles/CodeSheet.js';

/**
 * Flags that must ALL be true before the exit door releases.
 *
 * Phase 3 adds `valvePuzzleSolved`, Phase 4 adds `machinePuzzleSolved` -
 * extend this list then. Flags missing from GameState read as `undefined`
 * (falsy), so the door correctly stays shut until those phases land.
 */
const REQUIRED_DOOR_FLAGS = [
  'gearPuzzleSolved',
  'circuitPuzzleSolved',
  'valvePuzzleSolved',
  'machinePuzzleSolved',
];

/**
 * Game - top-level orchestrator.
 *
 * Owns the SceneManager + GameState, builds the environment and wires all
 * per-frame updates. Later phases register extra systems here (interaction,
 * puzzles, audio, UI) so that main.js never grows.
 */
export class Game {
  constructor(canvas, ui) {
    this.ui = ui;
    this.sceneManager = new SceneManager(canvas);
    this.gameState = new GameState();

    this.scene = this.sceneManager.scene;
    this.camera = this.sceneManager.camera;
    this.renderer = this.sceneManager.renderer;
    this.player = new PlayerController(this.camera, this.renderer.domElement);

    this._fpsAccum = 0;
    this._fpsFrames = 0;

    // Aiming point in the centre of the screen (Phase 4).
    this.crosshair = new Crosshair(document.getElementById('app'));
    this.prompt = new InteractionPrompt(document.getElementById('app'));

    // Document reader (Phase 5). Opening it blocks player input and frees the
    // cursor, both handled by the panel through the player controller.
    this.readingPanel = new ReadingPanel(document.getElementById('app'), {
      player: this.player,
    });

    // Player-facing text: stacked toasts plus the objective tracker (Phase 6).
    this.messages = new GameMessages(document.getElementById('app'), this.gameState);

    // Numeric keypad for the drawer lock (Phase 7).
    this.keypadPanel = new KeypadPanel(document.getElementById('app'), {
      player: this.player,
    });

    // Settings / controls (Phase 13). Options are applied immediately and
    // persisted, so a reload keeps the player's choices.
    this.settings = loadSettings();
    this.settingsPanel = new SettingsPanel(document.getElementById('app'), {
      player: this.player,
      onChange: (key, value) => this._applySetting(key, value),
      onResume: () => this._onSettingsClosed(),
    });
    this.settingsPanel.applySettings(this.settings);

    // Sound (Phase 11). The context is created lazily on the first gesture
    // (see the pointer-lock listener), because browsers refuse to start audio
    // outside a user interaction.
    this.audio = new AudioManager();
    this.player.onFootstep = () => this.audio.footstep();

    // Completion overlay (Phase 10). The game is fully rebuildable from
    // scratch, so "Play again" simply reloads the page rather than trying to
    // unwind and reset every system.
    this.endScreen = new EndScreen(document.getElementById('app'), {
      player: this.player,
      onRestart: () => window.location.reload(),
    });

    // Run statistics shown on the completion screen. `startedAt` uses the same
    // clock as the render loop so the timer cannot drift away from elapsed time.
    this.runStartedAt = 0;
    this.runSeconds = 0;
    this.gearTurns = 0;

    // Raycast interaction system (Phase 4).
    this.interactions = new InteractionManager(this.camera, {
      crosshair: this.crosshair,
      prompt: this.prompt,
      player: this.player,
    });

    // Dim / brighten the crosshair based on pointer-lock state.
    document.addEventListener('pointerlockchange', () => {
      const locked = this.player.controls.isLocked;
      this.crosshair.el.classList.toggle('locked', locked);
      // Pointer lock is a genuine user gesture, so this is the safest moment to
      // start the AudioContext. Doing it in the constructor would leave it
      // suspended forever under the autoplay policy.
      if (locked) this.audio.unlock();
    });

    // Also unlock on the first keypress or click anywhere, in case the player
    // never acquires pointer lock (e.g. pressing Escape first).
    const tryUnlock = () => this.audio.unlock();
    window.addEventListener('keydown', tryUnlock, { once: true });
    window.addEventListener('pointerdown', tryUnlock, { once: true });

    this._initAudioToggle();
    this._initSettingsButton();

    // Re-apply anything restored from localStorage so the first frame already
    // reflects the saved options.
    for (const [key, value] of Object.entries(this.settings)) this._applySetting(key, value);
  }

  /**
   * Wire the on-screen sound indicator to the M key.
   *
   * The indicator is a label, not a button: it has pointer-events:none on
   * purpose, because a clickable element over the canvas would swallow the
   * click the player uses to re-acquire pointer lock. M is the real control and
   * works while locked, which a button could not.
   */
  /**
   * Wire the gear icon and the Esc key to the settings panel.
   *
   * Esc needs care: the reading panel and keypad each consume it to close
   * themselves. Without this ordering the first Esc would be swallowed by a
   * puzzle modal instead of pausing, so the settings check runs only when no
   * other modal owns the screen.
   */
  _initSettingsButton() {
    this.settingsButton = document.getElementById('settings-button');
    if (this.settingsButton) {
      this.settingsButton.addEventListener('click', () => {
        this.settingsPanel.isOpen ? this.settingsPanel.close() : this._openSettings();
      });
    }

    this._onEscKey = (event) => {
      if (event.code !== 'Escape') return;
      // A puzzle modal owns the screen: let it handle Esc itself.
      if (this.readingPanel.isOpen || this.keypadPanel.isOpen) return;

      event.preventDefault();
      if (this.settingsPanel.isOpen) {
        this.settingsPanel.close();
        if (this.settingsButton) this.settingsButton.classList.remove('paused-ui');
      } else {
        this._openSettings();
      }
    };
    window.addEventListener('keydown', this._onEscKey);
  }

  /**
   * Apply one settings change to the live systems and persist it.
   *
   * FOV and aspect must go through updateProjectionMatrix(), otherwise the
   * projection matrix is only rebuilt on resize and the slider looks broken.
   */
  _applySetting(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings);

    switch (key) {
      case 'sensitivity':
        // PointerLockControls.pointerSpeed scales movementX/movementY directly.
        this.player.controls.pointerSpeed = value;
        break;
      case 'fov':
        this.camera.fov = value;
        this.camera.updateProjectionMatrix();
        break;
      case 'volume':
        this.audio.setVolume(value);
        break;
      case 'shadows':
        // Both flags matter: `enabled` alone leaves already-rendered shadow
        // maps bound, and the caster flags decide what is drawn into them.
        this.renderer.shadowMap.enabled = !!value;
        this.scene.traverse((o) => {
          if (o.isLight && o.shadow) {
            o.castShadow = !!value && o.userData.wantsShadow !== false;
          }
        });
        // Materials must recompile for the define to take effect.
        this.scene.traverse((o) => {
          if (o.isMesh && o.material) o.material.needsUpdate = true;
        });
        break;
      
      default:
        break;
    }
  }

  /** Re-lock the pointer on resume, but only if the player had it locked. */
  _onSettingsClosed() {
    if (this._resumeWithLock) {
      this._resumeWithLock = false;
      this.player.controls.lock();
    }
  }

  _openSettings() {
    if (this.settingsPanel.isOpen) return;
    // Remember whether we are mid-game so resume can restore the pointer lock.
    this._resumeWithLock = this.player.controls.isLocked;
    this.settingsPanel.open();
    if (this.settingsButton) this.settingsButton.classList.add('paused-ui');
    this.messages.clear();
  }

  _initAudioToggle() {
    this.audioToggleEl = document.getElementById('audio-toggle');
    if (!this.audioToggleEl) return;

    const apply = (on) => {
      this.audio.setEnabled(on);
      this.audioToggleEl.textContent = on ? 'SOUND ON' : 'SOUND OFF';
      this.audioToggleEl.setAttribute('aria-pressed', String(on));
      this._soundOn = on;
    };
    apply(true);

    this._onToggleKey = (event) => {
      if (event.code !== 'KeyM') return;
      // Let the player mute before ever clicking, without unlocking the mouse.
      this.audio.unlock();
      apply(!this._soundOn);
    };
    window.addEventListener('keydown', this._onToggleKey);
  }

  async init() {
    this.ui.setStatus('Building laboratory\u2026');
    this.laboratory = new Laboratory(this.scene);

    // Light indoor haze. Kept low so distant walls stay readable rather than
    // fading into the background colour.
    this.scene.fog = new THREE.FogExp2(0x141c24, 0.012);
    this.scene.background = this.scene.fog.color;

    // Hand the room limits and solid objects to the player.
    this.player.setBounds(this.laboratory.bounds);
    this.player.setExitZone(this.laboratory.corridorBounds);
    this.player.setColliders(this.laboratory.colliders);
    this.player.setSpawn(1.5, 4.2);

    this._registerInteractions();

    this.sceneManager.addUpdater((dt, elapsed) => this._update(dt, elapsed));
    this.sceneManager.start();
    this.ui.fadeOutBoot();
    this.ui.showDebug(true);
  }

  /**
   * Register the objects the player can interact with.
   * Each entry is self-describing - no interaction logic lives in main.js.
   */
  _registerInteractions() {
    const lab = this.laboratory;

    // Final exit door: locked until every puzzle is solved (central _tryUnlockDoor gate).
    this.interactions.register(lab.door.leaf, {
      verb: 'Open',
      label: 'Door',
      distance: 3.2,
      onInteract: () => {
        if (lab.door.isLocked) {
          this.audio.keypadReject();
          this.messages.flash('Deadbolted. The laboratory systems are not all online yet.', { tone: 'bad' });
        } else {
          lab.door.toggle();
          // The door can be swung either way, so each direction gets its own
          // sound. Closing used to be silent, which made the leaf feel weightless.
          if (lab.door.isOpen) {
            this.audio.doorOpen();
            this.messages.flash('The door swings open. Cold air.', { tone: 'good' });
          } else {
            this.audio.doorClose();
          }
        }
      },
    });

    // The machine's driver gear (Phase 8). Turning it rotates all three.
    const driverGear = this.interactions.register(lab.machine.driver, {
      verb: 'Turn',
      label: 'Gear',
      distance: 2.4,
      onInteract: () => this._turnGear(),
    });
    driverGear.hitbox.scale.set(1.5, 1.5, 1.5);

    // The desk itself is scenery; the drawer is the real interaction target.
    this.interactions.register(lab.desk, {
      verb: 'Examine',
      label: 'Desk',
      distance: 2.6,
      onInteract: () => this.messages.flash('A sturdy lab desk. The drawer in the pedestal is locked.'),
    });

    const drawer = this.interactions.register(lab.desk.userData.drawer, {
      verb: 'Open',
      label: 'Drawer',
      distance: 2.2,
      onInteract: () => {
        if (lab.drawer.isLocked) {
          this.messages.flash('Locked. A keypad sits beside the drawer.', { tone: 'bad' });
          return;
        }
        lab.drawer.toggle();
        this.audio.drawerOpen();
        if (lab.drawer.isOpen) this._revealDrawerKey();
      },
    });
    // Aim the forgiving hit sphere at the drawer front rather than the floor.
    drawer.hitbox.position.set(0, 0.5, 0.6);

    // The keypad on the pedestal front.
    const keypad = this.interactions.register(lab.keypad.group, {
      verb: 'Use',
      label: 'Keypad',
      distance: 2.2,
      onInteract: () => this._openKeypad(),
    });
    keypad.hitbox.position.set(0, 0, 0.12);
    keypad.hitbox.scale.set(1.1, 1.3, 0.6);

    // The key inside the drawer. Disabled until the drawer is open, so it
    // cannot be picked up (or raycast) while still hidden.
    this._keyInteraction = this.interactions.register(lab.drawerKey, {
      verb: 'Take',
      label: 'Key',
      distance: 1.8,
      onInteract: () => this._takeKey(),
    });
    this._keyInteraction.hitbox.scale.set(1.6, 1.6, 1.6);
    this._keyInteraction.setEnabled(false);

    // The programming note lying on the desk (Phase 5).
    const sheet = this.interactions.register(lab.codeSheet, {
      verb: 'Read',
      label: 'Lab Note #6',
      distance: 2.2,
      onInteract: () => this._readCodeSheet(),
    });
    // The sheet lies flat on the desk top, so lift the hit sphere to its height
    // and keep it snug enough that the desk itself is not swallowed by it.
    sheet.hitbox.position.set(0, 0.08, 0);
    sheet.hitbox.scale.set(0.75, 0.35, 0.9);

    // Electrical circuit panel (Phase 16): one interaction per switch proxy.
    // The panel is on the south wall, so 2.6 m comfortably covers standing
    // in front of it without reaching across the room.
    for (let i = 0; i < lab.circuitPanel.switchProxies.length; i++) {
      const proxy = lab.circuitPanel.switchProxies[i];
      const sw = this.interactions.register(proxy, {
        verb: 'Toggle',
        label: `Switch ${i + 1}`,
        distance: 2.6,
        onInteract: () => this._toggleCircuitSwitch(i),
      });
      sw.hitbox.scale.set(0.7, 1.6, 0.7);
    }

    // Wiring memo pinned beside the panel: the deduction clue.
    const memo = this.interactions.register(lab.circuitMemo, {
      verb: 'Read',
      label: 'Wiring Memo',
      distance: 2.4,
      onInteract: () => this._readCircuitMemo(),
    });
    memo.hitbox.scale.set(0.8, 0.9, 0.5);

    // While a document is open the prompt must not linger under the modal.
    this.readingPanel.onClose = () => this.prompt.hide();
    // Stale toasts would otherwise sit on top of the modal.
    this.readingPanel.onOpen = () => this.messages.clear();
  }

  /**
   * Open the note in the reading panel and record that the player has seen it.
   * Re-reading is allowed - the panel just opens again.
   */
  _readCodeSheet() {
    this.gameState.set('hasReadCodeSheet', true);
    this.prompt.hide();
    this.audio.uiClick();
    this.readingPanel.open({
      title: CODE_SHEET_TITLE,
      lines: CODE_SHEET_LINES,
      hint: CODE_SHEET_HINT,
    });
    if (!this._firstReadToastShown) {
      this._firstReadToastShown = true;
      this.messages.flash('A recursion drill. Four factorial: the keypad wants 24.', {
        tone: 'good',
      });
    }
  }

  /**
   * Open the numeric keypad.
   *
   * The correct code is not shown here - the player is meant to work it out
   * from the note. If they have not read the note yet, say so instead.
   */
  _openKeypad() {
    if (this.laboratory.keypad.isUnlocked) {
      this.messages.flash('The keypad reads OPEN.', { tone: 'good' });
      return;
    }

    this.prompt.hide();
    this.messages.clear();
    this.keypadPanel.open({
      title: 'Pedestal Keypad',
      prompt: this.gameState.hasReadCodeSheet
        ? 'Four numbers. The note said to run the drill.'
        : 'Four numbers. You have not found the note yet.',
    });

    // The panel only reports presses; this callback owns the decision.
    this.keypadPanel.onSubmit = (entry) => this._submitKeypadCode(entry);
    this.keypadPanel.onClose = () => this.prompt.hide();
    // Each button press gets its own blip. KeypadPanel stays silent so it does
    // not need to know about audio at all.
    this.keypadPanel.onKey = (key) => {
      if (key === 'OK') this.audio.keypadPress('ok');
      else if (key === 'C') this.audio.keypadPress('clear');
      else this.audio.keypadPress('digit');
    };
  }

  /** Validate the entered code and unlock the drawer on success. */
  _submitKeypadCode(entry) {
    const keypad = this.laboratory.keypad;
    keypad.displayValue = entry;

    const result = keypad.submit();

    if (!result.correct) {
      this.keypadPanel._entry = '';
      this.keypadPanel._render();
      this.keypadPanel.reject();
      this.audio.keypadReject();
      this.keypadPanel.setStatus('Access denied.');
      this.messages.flash('Wrong code.', { tone: 'bad' });
      return;
    }

    // Success: the drawer lock is defeated.
    this.gameState.set('codeSolved', true);
    this.laboratory.drawer.unlock();
    this.laboratory.drawer.open();
    this._revealDrawerKey();
    this.audio.keypadAccept();
    // Stagger the drawer slide so it starts just after the acceptance chime
    // instead of underneath it.
    setTimeout(() => this.audio.drawerOpen(), 180);

    this.keypadPanel.setStatus('Access granted.');
    this.keypadPanel.close();
    this.messages.flash('The drawer slides open.', { tone: 'good' });
  }

  /** Make the key visible and pickable once the drawer is open. */
  _revealDrawerKey() {
    const lab = this.laboratory;
    lab.drawerKey.visible = true;
    this._keyInteraction && this._keyInteraction.setEnabled(true);
  }

  /** Pick the key up out of the drawer. */
  _takeKey() {
    if (this.gameState.hasKey) return;

    this.gameState.set('hasKey', true);
    this.laboratory.drawerKey.visible = false;
    this._keyInteraction.setEnabled(false);
    this.audio.pickup();
    this.messages.flash('A small brass key.', { tone: 'good' });
  }

  /** Read the wiring memo: the deduction clue for the circuit panel. */
  _readCircuitMemo() {
    this.prompt.hide();
    this.audio.uiClick();
    this.readingPanel.open({
      title: 'Wiring Memo - Bay 3',
      lines: [
        'Rewiring after the surge. Read before touching the panel.',
        '',
        'The RED channel is burnt out. Leave it DISCONNECTED.',
        'Three systems need power: GREEN, YELLOW and WHITE.',
        'BLUE is a spare - keep it OFF.',
        '',
        'Set the good channels, then check the meter.',
      ],
      hint: 'Red OFF. Green, Yellow, White ON. Blue OFF.',
    });
  }

  /**
   * Flip a circuit switch (Phase 16).
   *
   * Gating order: gear power first (the panel is dead until the machine
   * runs), then lock once solved. A wrong-but-complete board buzzes and
   * flashes the warning dome; the right one latches and completes.
   */
  _toggleCircuitSwitch(index) {
    const lab = this.laboratory;

    if (this.gameState.circuitPuzzleSolved) {
      this.messages.flash('The panel hums steadily. The circuit holds.', { tone: 'good' });
      return;
    }
    if (!this.gameState.gearPuzzleSolved) {
      this.audio.keypadReject();
      this.messages.flash('Dead panel. The machine on the east wall must run first.', { tone: 'bad' });
      return;
    }

    const changed = lab.circuitPuzzle.toggle(index);
    if (!changed) return;
    this.audio.switchToggle();

    if (lab.circuitPuzzle.solved) {
      this._solveCircuit();
      return;
    }

    // All five thrown but wrong: unmistakable fault feedback.
    if (lab.circuitPuzzle.correctCount <= 2) {
      this.audio.circuitBuzz();
      lab.circuitPanel.flashWarning(1.0);
      this.messages.flash('The warning lamp flares. Wrong combination.', { tone: 'bad' });
    } else {
      this.messages.flash(`${lab.circuitPuzzle.correctCount} of 5 channels live.`);
    }
  }

  /** Latch the circuit: lock the board, light the room, update state. */
  _solveCircuit() {
    const lab = this.laboratory;
    if (this.gameState.circuitPuzzleSolved) return; // never complete twice

    this.gameState.set('circuitPuzzleSolved', true);
    this.audio.circuitActivate();
    this.messages.flash('Relays engage. The panel output socket glows green.', { tone: 'good' });
    this.messages.flash('Somewhere new, a system powers up.');
    this._tryUnlockDoor();
  }

  /**
   * Central exit gate: the door unlocks only once every puzzle is solved.
   *
   * `valvePuzzleSolved` / `machinePuzzleSolved` do not exist yet (Phases 3-4),
   * so missing flags count as unsolved - the door stays shut until those
   * phases land and set them. Extend REQUIRED_FLAGS, never this method.
   */
  _tryUnlockDoor() {
    if (this.gameState.doorUnlocked) return;
    const ready = REQUIRED_DOOR_FLAGS.every((flag) => this.gameState[flag]);
    if (!ready) return;

    this.gameState.set('doorUnlocked', true);
    this.laboratory.door.unlock();
    this.audio.doorUnlock();
    this.messages.flash('All systems online. Somewhere, a deadbolt releases.', { tone: 'good' });
  }

  /**
   * Turn the driver gear one tooth.
   *
   * Gating order matters: the machine needs the key, and once powered the
   * player cannot keep turning it.
   */
  _turnGear() {
    const lab = this.laboratory;

    if (lab.gearPuzzle.solved) {
      this.messages.flash('The machine is already running.', { tone: 'good' });
      return;
    }
    if (!this.gameState.hasKey) {
      // A dull, dead thud - the gear is seized, so it should not sound like a
      // successful turn.
      this.audio.keypadReject();
      this.messages.flash('The gear is seized. Something is holding the lock.', { tone: 'bad' });
      return;
    }

    this.gearTurns++;
    this.audio.gearTurn();
    const solved = lab.machine.turnDriver(1);

    if (solved) {
      this._powerOn();
      return;
    }

    // Partial progress: report how many gears are lined up.
    const n = lab.gearPuzzle.alignedCount;
    this.messages.flash(`${n} of 3 gears aligned.`);
  }

  /** Restore power and light the room. The exit stays locked until every puzzle is solved. */
  _powerOn() {
    const lab = this.laboratory;

    this.gameState.set('gearPuzzleSolved', true);
    this.gameState.set('machineActive', true);

    lab.lighting.setActive();

    this.audio.powerOn();
    this.messages.flash('The machine hums to life. Lights return.', { tone: 'good' });
    this.messages.flash('The exit is still locked. More systems need power.');
    this._tryUnlockDoor();
  }

  /** Detect the player leaving the room through the open door. */
  _checkEscape() {
    if (this.gameState.escaped) return;

    const lab = this.laboratory;
    const doorOpen = lab.door.isOpen;
    // The doorway sits at z = -6; past it the player has left the lab.
    const throughDoorway = this.player.object.position.z < -5.6 && this.player.object.position.x < 0.9 &&
      this.player.object.position.x > -0.9;

    if (!doorOpen || !throughDoorway) return;

    this.gameState.set('escaped', true);

    // Freeze the clock BEFORE showing the screen, otherwise the last few
    // frames of walking keep counting and the displayed time drifts.
    this.runSeconds = Math.max(0, this._elapsed - this.runStartedAt);
    this.messages.clear();
    this.audio.escape();
    this.endScreen.show({
      seconds: this.runSeconds,
      gearTurns: this.gearTurns,
      objectivesDone: OBJECTIVES.filter((o) => this.gameState[o.flag]).length,
      objectivesTotal: OBJECTIVES.length,
    });
  }

  _update(dt, elapsed) {
    this._elapsed = elapsed;

    // Start the run clock on the first frame, not in init(): init() runs before
    // SceneManager.start(), so a clock started there would include boot time.
    if (!this.runStartedAt) this.runStartedAt = elapsed;

    this.player.update(dt);
    this.laboratory.update(dt, elapsed);
    this.interactions.update(dt, elapsed);
    this.messages.update(dt);
    this._checkEscape();
    // A modal has focus: clear the prompt/crosshair so nothing competes.
    if (this.readingPanel.isOpen || this.keypadPanel.isOpen || this.settingsPanel.isOpen) {
      this.prompt.hide();
      this.crosshair.setActive(false);
    }
    this._updateFps(dt);
  }

  _updateFps(dt) {
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      const fps = Math.round(this._fpsFrames / this._fpsAccum);
      this.ui.setDebug(
        `FPS: ${fps}`,
        `Draw calls: ${this.renderer.info.render.calls} | Triangles: ${this.renderer.info.render.triangles}`
      );
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }
}
