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
import { CODE_SHEET_LINES, CODE_SHEET_TITLE, CODE_SHEET_HINT } from '../puzzles/CodeSheet.js';

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
  }

  /**
   * Wire the on-screen sound indicator to the M key.
   *
   * The indicator is a label, not a button: it has pointer-events:none on
   * purpose, because a clickable element over the canvas would swallow the
   * click the player uses to re-acquire pointer lock. M is the real control and
   * works while locked, which a button could not.
   */
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

    // Final exit door: locked until the machine is powered (Phase 8).
    this.interactions.register(lab.door.leaf, {
      verb: 'Open',
      label: 'Door',
      distance: 3.2,
      onInteract: () => {
        if (lab.door.isLocked) {
          this.audio.keypadReject();
          this.messages.flash(
            this.gameState.gearPuzzleSolved
              ? 'Unlocked. Walk through it.'
              : 'Deadbolted. Something has to release it first.',
            { tone: 'bad' }
          );
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

  /** Restore power, light the room, and release the exit door. */
  _powerOn() {
    const lab = this.laboratory;

    this.gameState.set('gearPuzzleSolved', true);
    this.gameState.set('machineActive', true);
    this.gameState.set('doorUnlocked', true);

    lab.door.unlock();
    lab.lighting.setActive();

    this.audio.powerOn();
    // The deadbolt lets go a beat after the machine settles.
    setTimeout(() => this.audio.doorUnlock(), 700);
    this.messages.flash('The machine hums to life. Lights return.', { tone: 'good' });
    this.messages.flash('Somewhere behind you, a deadbolt releases.');
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
    if (this.readingPanel.isOpen || this.keypadPanel.isOpen) {
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
