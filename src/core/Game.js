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
import { OBJECTIVES, countObjectivesDone } from '../ui/GameMessages.js';
import { AudioManager } from '../audio/AudioManager.js';
import { SettingsPanel, loadSettings, saveSettings } from '../ui/SettingsPanel.js';
import { CODE_SHEET_LINES, CODE_SHEET_TITLE, CODE_SHEET_HINT } from '../puzzles/CodeSheet.js';

/**
 * Puzzle flags that gate the exit door - every puzzle in the game.
 *
 * All four now exist (gear, circuit, valve, final machine). `_tryUnlockDoor`
 * is called by each puzzle's completion handler; the last one to complete
 * releases the deadbolt. Do not add a flag that GameState cannot set true.
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
          // Spec: before machine completion this exact line. It also keeps the
          // older "not all online yet" hint for the general locked state.
          this.messages.flash(
            'Exit mechanism is still locked. The lab systems are not all online yet.',
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

    // The keyhole on the cabinet front (user revision): the brass key must
    // be physically, visibly seated before the drive lock releases.
    const machineKey = this.interactions.register(lab.machine.keyProxy, {
      verb: 'Use',
      label: 'Keyhole',
      distance: 2.0,
      onInteract: () => this._insertMachineKey(),
    });
    machineKey.hitbox.scale.set(1.3, 1.3, 1.3);

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

    // No wiring memo (user revision): the panel toasts "n of 5 channels
    // aligned" and fills its proximity bar, so a note would only repeat
    // what the instruments already say.

    // Phase 17: three valve handwheels on the pressure rig (east wall).
    for (let i = 0; i < lab.valveRig.valveProxies.length; i++) {
      const proxy = lab.valveRig.valveProxies[i];
      const valve = this.interactions.register(proxy, {
        verb: 'Turn',
        label: 'Valve',
        distance: 2.6,
        onInteract: () => this._turnValve(i),
      });
      valve.hitbox.scale.set(1.1, 1.1, 1.1);
    }

    // No pressure placard (user revision): each turn toasts how many of
    // the three valves are aligned, which is the deduction surface now.

    // Phase 18: three control dials + the activation button on the final machine.
    for (let i = 0; i < lab.finalMachine.dialProxies.length; i++) {
      const proxy = lab.finalMachine.dialProxies[i];
      const dial = this.interactions.register(proxy, {
        verb: 'Rotate',
        label: 'Control',
        distance: 2.6,
        onInteract: () => this._turnFinalDial(i),
      });
      dial.hitbox.scale.set(0.9, 0.9, 0.9);
    }

    const activate = this.interactions.register(lab.finalMachine.activateProxy, {
      verb: 'Activate',
      label: 'Machine',
      distance: 2.6,
      onInteract: () => this._activateFinalMachine(),
    });
    activate.hitbox.scale.set(1.1, 1.1, 1.1);

    // Station reading plates: the three clues that combine into the
    // final machine's dial solution. Always readable, one per earlier puzzle.
    for (const plate of lab.stationPlates) {
      const io = this.interactions.register(plate.group, {
        verb: 'Read',
        label: 'Station Plate',
        distance: 2.2,
        onInteract: () => {
          this.prompt.hide();
          this.audio.uiClick();
          this.messages.flash(`Engraved: ${plate.group.userData.reading}`, { tone: 'good', duration: 4000 });
        },
      });
      io.hitbox.scale.set(1.0, 0.9, 0.8);
    }

    // No orientation chart (removed per user image): the calibration board
    // and its examine modal are gone. The station plates above are the
    // remaining clue path to the dial solution.

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

    // A throw that doesn't land on the target faults the bank. The toast
    // names HOW MANY channels match (the panel's needle and proximity bar
    // show the same), so the player steers by deduction. Each lever moves
    // only its own switch.
    this.audio.circuitBuzz();
    lab.circuitPanel.flashWarning(1.0);
    const aligned = lab.circuitPuzzle.correctCount;
    this.messages.flash(`The warning lamp flares: ${aligned} of 5 channels aligned.`, { tone: 'bad' });
  }

  /** Latch the circuit: lock the board, light the room, update state. */
  _solveCircuit() {
    const lab = this.laboratory;
    if (this.gameState.circuitPuzzleSolved) return; // never complete twice

    this.gameState.set('circuitPuzzleSolved', true);
    this.audio.circuitActivate();
    // The pressure rig only comes alive now - before this it is dead metal.
    lab.valveRig.powered = true;
    // Stage 2: more of the room comes up.
    lab.lighting.setLevels(0.78, 0.6);
    this.audio.setAmbienceLevel(0.6);
    this.messages.flash('Relays engage. The panel output socket glows green.', { tone: 'good' });
    this.messages.flash('A hiss from the east wall: the pressure rig is live.');
    this._tryUnlockDoor();
  }

  /**
   * Turn one valve a quarter-step (Phase 17).
   *
   * Gating order: circuit power first (the rig is dead until then), then
   * lock once solved. A wrong combination hisses and flashes the warning
   * dome; the right one stabilises and completes.
   */
  _turnValve(index) {
    const lab = this.laboratory;

    if (this.gameState.valvePuzzleSolved) {
      this.messages.flash('The pressure holds steady. The valves are locked.', { tone: 'good' });
      return;
    }
    if (!this.gameState.circuitPuzzleSolved) {
      this.audio.keypadReject();
      this.messages.flash('Pressure system has no power.', { tone: 'bad' });
      return;
    }

    const changed = lab.valvePuzzle.turn(index);
    if (!changed) return;
    this.audio.valveTurn();

    if (lab.valvePuzzle.solved) {
      this._solveValve();
      return;
    }

    // Unstable pressure: warning dome, hiss. The toast names HOW MANY
    // valves are already on their solution, so the player can steer the
    // remaining wheels by deduction.
    this.audio.pressureHiss();
    lab.valveRig.flashWarning(0.9);
    const aligned = lab.valvePuzzle.correctCount;
    this.messages.flash(`Pressure unstable: ${aligned} of 3 valves aligned.`, { tone: 'bad' });
  }

  /** Stabilise pressure: lock valves, light pipes/chamber, update state. */
  _solveValve() {
    const lab = this.laboratory;
    if (this.gameState.valvePuzzleSolved) return; // never complete twice

    this.gameState.set('valvePuzzleSolved', true);
    this.audio.pressureStable();
    // Stage 3: machinery power up, room nearly full.
    lab.lighting.setLevels(0.9, 0.8);
    this.audio.setAmbienceLevel(0.75);
    this.messages.flash('Pressure stabilised. The chamber glows green.', { tone: 'good' });
    this.messages.flash('Pipes light up in sequence toward the machine.');
    this._tryUnlockDoor();
  }

  /** True once every prerequisite puzzle for the final machine is done. */
  _finalMachinePowered() {
    return (
      this.gameState.gearPuzzleSolved &&
      this.gameState.circuitPuzzleSolved &&
      this.gameState.valvePuzzleSolved
    );
  }

  /**
   * Turn one control dial a quarter-step (Phase 18).
   *
   * The dial solution is assembled from the three station plates; this
   * method never hints at it - it only reports how many dials are right.
   */
  _turnFinalDial(index) {
    const lab = this.laboratory;

    if (this.gameState.machinePuzzleSolved) {
      this.messages.flash('The machine hums at a steady pitch.', { tone: 'good' });
      return;
    }
    if (!this._finalMachinePowered()) {
      this.audio.keypadReject();
      this.messages.flash('Laboratory system is not fully powered.', { tone: 'bad' });
      return;
    }

    lab.finalMachine.powered = true;
    const changed = lab.finalPuzzle.turn(index);
    if (!changed) return;
    this.audio.machineClick();

    // No "n of 3 aligned" hint - the station plates and the painted
    // orientation chart are the guides.
    this.messages.flash(
      lab.finalPuzzle.solved
        ? 'All three dials settled. The button glows.'
        : 'The dial clicks into place.',
      { tone: lab.finalPuzzle.solved ? 'good' : 'info' }
    );
  }

  /**
   * Press the activation button: physical feedback first, then the 9-step
   * sequence if the dials are right.
   *
   * A rejected press gives visibly (plunger dips and springs back, master
   * lamp strobes red) instead of only showing a toast - a button that
   * visibly refuses to go down reads as intentional in both states.
   */
  _activateFinalMachine() {
    const lab = this.laboratory;

    if (this.gameState.machinePuzzleSolved) {
      this.messages.flash('LABORATORY SYSTEM ONLINE.', { tone: 'good' });
      return;
    }

    const aligned = this._finalMachinePowered() && lab.finalPuzzle.solved;

    if (this._finalMachinePowered() && !lab.finalPuzzle.solved) {
      // Powered but dials wrong: the classic rejected press, plus a
      // consequence - the dials KICK BACK to zero. Blind enumeration of
      // 64 combos then costs 6 turns to re-enter each time, so the station
      // plates are genuinely worth reading.
      lab.finalPuzzle.reset();
      lab.finalMachine.pressButton(false);
      this.audio.keypadReject();
      this.messages.flash('The button flashes red. The dials kick back to zero.', { tone: 'bad' });
      return;
    }

    if (!this._finalMachinePowered()) {
      // Not powered: same physical resist, different message.
      lab.finalMachine.pressButton(false);
      this.audio.keypadReject();
      this.messages.flash('Laboratory system is not fully powered.', { tone: 'bad' });
      return;
    }

    // Aligned: the plunger depresses and latches (never complete twice -
    // pressButton() returns false if the sequence already started).
    if (!lab.finalMachine.pressButton(aligned)) return;
    if (this.gameState.machinePuzzleSolved) return;
    this.gameState.set('machinePuzzleSolved', true);

    // STEP 2-6: mechanical start sound + the staged visual timeline
    // (indicators -> rotors -> core -> pipes) runs inside FinalMachine.update.
    this.audio.machineStart();
    lab.finalMachine.beginActivation();

    // STEP 7: laboratory lighting changes to FULL power (stage 4 of the
    // progression) - main lights activate, plus the exit spot and EXIT sign
    // ramp up as the payoff. All damped, so they fade in behind the startup.
    lab.lighting.setActive();
    lab.lighting.setExitBoost(1.6);
    lab.setExitSignBoost(3.0);
    this.audio.setAmbienceLevel(0.9);

    // STEP 8: final exit mechanism unlocks via the central gate, then the
    // door swings itself open as the payoff (spec: "animate door"). The
    // delay lets the machine's spool-up start first; the guard keeps it
    // idempotent if the player manually opens the door in the meantime.
    this._tryUnlockDoor();
    if (!lab.door.isLocked) {
      setTimeout(() => {
        if (!lab.door.isOpen && this.gameState.doorUnlocked) {
          lab.door.open();
          this.audio.doorOpen();
          this.messages.flash('The exit door swings open. Cold air.', { tone: 'good' });
        }
      }, 1400);
    }

    // STEP 9: success messages.
    this.messages.flash('LABORATORY SYSTEM ONLINE', { tone: 'good', duration: 3600 });
    this.messages.flash('EXIT UNLOCKED', { tone: 'good', duration: 3600 });
  }

  /**
   * Central exit gate: the door unlocks once every puzzle is solved.
   *
   * The gate reads REQUIRED_DOOR_FLAGS (all four puzzles). Each completion
   * handler calls this; whichever finishes last releases the deadbolt.
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
   * Seat the brass key in the machine's keyhole (user revision).
   *
   * Until now `hasKey` was only an inventory flag that silently un-gated the
   * gear. This makes the handoff physical: the key slides into the lock and
   * turns (Machine.insertKey animation), and only then does the drive obey.
   */
  _insertMachineKey() {
    const lab = this.laboratory;

    if (this.gameState.machineKeyInserted) {
      this.messages.flash('The brass key sits deep in the lock, turned firm.', { tone: 'good' });
      return;
    }
    if (!this.gameState.hasKey) {
      this.audio.keypadReject();
      this.messages.flash('A brass keyhole, empty. The key must be somewhere in this room.', {
        tone: 'bad',
      });
      return;
    }

    this.gameState.set('machineKeyInserted', true);
    lab.machine.insertKey();
    this.audio.keyInsert();
    this.messages.flash('The key slides home and turns - the drive lock releases.', {
      tone: 'good',
    });
  }

  /**
   * Turn the driver gear one tooth.
   *
   * Gating order matters: the key must be SEATED in the keyhole first (not
   * merely held), and once powered the player cannot keep turning it.
   */
  _turnGear() {
    const lab = this.laboratory;

    if (lab.gearPuzzle.solved) {
      this.messages.flash('The machine is already running.', { tone: 'good' });
      return;
    }
    if (!this.gameState.machineKeyInserted) {
      // A dull, dead thud - the drive lock is still engaged, so it should
      // not sound like a successful turn.
      this.audio.keypadReject();
      const hint = this.gameState.hasKey
        ? 'The drive lock is engaged. The keyhole below the gears is waiting.'
        : 'The drive gear is locked tight. It needs a key.';
      this.messages.flash(hint, { tone: 'bad' });
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

    // Stage 1 of the lighting progression (spec: light communicates progress).
    // Full power is reserved for the FINAL machine; the gear solve only
    // brings the machine bay and part of the room up from dormant.
    lab.lighting.setLevels(0.6, 0.4);
    // The circuit panel's meter only becomes live once the gear machine runs
    // (the switches were already gated on this flag in _toggleCircuitSwitch).
    lab.circuitPanel.powered = true;

    this.audio.powerOn();
    this.messages.flash('The machine hums to life. Lights stutter on.', { tone: 'good' });
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
      objectivesDone: countObjectivesDone(this.gameState),
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
