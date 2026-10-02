import * as T from 'three';

// Minimal browser stub so the browser-only listeners can be constructed.
globalThis.window = { addEventListener() {}, removeEventListener() {} };

import { Door } from '../src/objects/Door.js';
import { InteractionManager } from '../src/interaction/InteractionManager.js';
import { InteractiveObject } from '../src/interaction/InteractiveObject.js';

const sc = new T.Scene();
const door = new Door({
  material: new T.MeshStandardMaterial({ color: 0x333333 }),
  metalMaterial: new T.MeshStandardMaterial({ color: 0x222222 }),
});
door.group.position.set(-0.8, 0, -5.9);
sc.add(door.group);

const cam = new T.PerspectiveCamera(75, 1.7, 0.05, 200);
const msgs = [];
const im = new InteractionManager(cam, {
  prompt: { show: (t) => msgs.push(t), hide: () => msgs.push('HIDE') },
});

let fired = false;
im.register(door.leaf, {
  verb: 'Open',
  label: 'Door',
  distance: 3.2,
  onInteract: () => { fired = true; },
});

function test(px, pz, tx, tz, desc) {
  cam.position.set(px, 1.7, pz);
  cam.lookAt(tx, 1.2, tz);
  // The renderer normally refreshes world matrices every frame; do the same.
  sc.updateMatrixWorld(true);
  cam.updateMatrixWorld(true);
  im._current = null;
  im.update(1 / 60, 0);
  const last = msgs[msgs.length - 1];
  const hit = last && last !== 'HIDE';
  console.log((hit ? 'HIT   ' : 'miss  ') + desc.padEnd(38) + 'prompt=' + last);
}

console.log('--- raycast range gating ---');
test(1.5, 4.2, 0, -5.9, 'spawn -> door (~10m, out of range)');
test(0.8, -3.2, 0, -5.9, '2.7m from door (in range)');
test(-5.5, 2.0, -5.5, 0, 'facing away from door');

console.log('\n--- E key gating ---');
im._current = im.objects[0];

im.player = { blocked: false, controls: { isLocked: false } };
fired = false; im._tryInteract();
console.log('pointer unlocked   -> fired (expect false):', fired);

im.player = { blocked: false, controls: { isLocked: true } };
fired = false; im._tryInteract();
console.log('locked + unblocked -> fired (expect true) :', fired);

im.player = { blocked: true, controls: { isLocked: true } };
fired = false; im._tryInteract();
console.log('blocked (keypad)   -> fired (expect false):', fired);

console.log('\n--- prompt text ---');
console.log('promptText =', JSON.stringify(im.objects[0].promptText));

console.log('\n--- shared-material isolation (regression test) ---');
// Two desks built from the SAME shared wood material, like the real lab props.
const sharedWood = new T.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 0.8 });
const deskA = new T.Mesh(new T.BoxGeometry(1, 1, 1), sharedWood);
const deskB = new T.Mesh(new T.BoxGeometry(1, 1, 1), sharedWood);

const ioA = new InteractiveObject(deskA, { verb: 'Examine', label: 'Desk' });
const ioB = new InteractiveObject(deskB, { verb: 'Examine', label: 'Other' });

ioA.setCurrent(true);
console.log('deskA highlighted (expect teal) :', deskA.material.emissive.getHexString());
console.log('deskB untouched    (expect 0)    :', deskB.material.emissive.getHexString());
console.log('shared material untouched (000000):', sharedWood.emissive.getHexString());

ioA.setCurrent(false);
console.log('after un-highlight, deskA restored (expect 0):', deskA.material.emissive.getHexString());
console.log('deskB material is a separate instance:', deskA.material !== deskB.material);
void ioB;

console.log('\n--- Phase 5: code sheet (makePaperTexture content) ---');
import {
  CODE_SHEET_LINES,
  CODE_SHEET_TITLE,
  evaluateKeypadCode,
} from '../src/puzzles/CodeSheet.js';

console.log('title:', JSON.stringify(CODE_SHEET_TITLE));
console.log('sheet text:');
for (const line of CODE_SHEET_LINES) console.log('  | ' + line);

console.log('\n--- keypad answer derived from the sheet ---');
const answer = evaluateKeypadCode();
console.log('drill(4) =', answer, '(expect 24)');

// The evaluator must reject code it does not understand rather than guess.
console.log('garbage source  ->', evaluateKeypadCode(['print("hi")']), '(expect null)');
console.log('non-recursive  ->', evaluateKeypadCode(['def f(n):', '    return n']), '(expect null)');
console.log('other call name->', evaluateKeypadCode([...CODE_SHEET_LINES.slice(0, 4), 'keypad = other(4)']), '(expect null)');

console.log('\n--- Phase 6: objective chain (GameMessages) ---');
import { GameState } from '../src/core/GameState.js';
import { OBJECTIVES } from '../src/ui/GameMessages.js';

// Every flag the objective chain reads must actually exist on GameState,
// otherwise the tracker silently shows the wrong step forever.
const state = new GameState();
for (const o of OBJECTIVES) {
  console.log(`${o.flag.padEnd(18)} exists on GameState:`, typeof state[o.flag] === 'boolean');
}

// The current objective is the first incomplete entry; advancing flags must
// move the tracker along the list.
const currentObjective = () => {
  const o = OBJECTIVES.find((entry) => !state[entry.flag]);
  return o ? o.text : OBJECTIVES[OBJECTIVES.length - 1].doneText;
};
console.log('\ninitial      :', JSON.stringify(currentObjective()));
state.set('hasReadCodeSheet', true);
console.log('read note    :', JSON.stringify(currentObjective()));
state.set('codeSolved', true);
state.set('hasKey', true);
console.log('took the key :', JSON.stringify(currentObjective()));
for (const o of OBJECTIVES) state.set(o.flag, true);
console.log('all complete :', JSON.stringify(currentObjective()));

// GameState must notify subscribers so the tracker can re-render reactively.
let notified = 0;
state.on('hasKey', () => notified++);
state.set('hasKey', false);
state.set('hasKey', false); // same value again - must NOT re-notify
console.log('\nlistener fired once for a real change:', notified === 1, `(fired ${notified})`);

console.log('\n--- Phase 7: keypad lock + drawer ---');
// The lock logic is pure, so it is tested without the DOM/Three scene.
import { Drawer } from '../src/objects/Drawer.js';

const SOLUTION = answer; // derived from the note in the test above

/** Minimal stand-in for the Keypad's lock logic (no canvas required). */
const makeKeypad = (solution) => ({
  solution,
  isUnlocked: false,
  displayValue: '',
  submit() {
    if (this.isUnlocked) return { correct: true, unlocked: true };
    const correct =
      this.solution !== null && this.displayValue !== '' &&
      Number(this.displayValue) === Number(this.solution);
    if (correct) this.isUnlocked = true;
    this.displayValue = '';
    return { correct, unlocked: this.isUnlocked };
  },
});

const pad = makeKeypad(SOLUTION);
console.log('solution derived from the note:', SOLUTION, '(expect 24)');

pad.displayValue = '0000';
console.log('wrong code  ->', JSON.stringify(pad.submit()), '(expect correct:false)');
console.log('entry wiped after failure   :', JSON.stringify(pad.displayValue), '(expect "")');

pad.displayValue = String(SOLUTION);
const win = pad.submit();
console.log('right code  ->', JSON.stringify(win), '(expect correct:true)');
console.log('stays unlocked on resubmit  :', JSON.stringify(pad.submit()), '(expect unlocked:true)');

// A keypad with no derivable answer must never accept anything.
const broken = makeKeypad(null);
broken.displayValue = '24';
console.log('no solution ->', JSON.stringify(broken.submit()), '(expect correct:false)');

// Drawer lock state machine.
const drawerGroup = new T.Group();
const drawer = new Drawer(drawerGroup, { openDistance: 0.55 });
console.log('\ndrawer starts locked:', drawer.isLocked === true);
console.log('locked drawer refuses to open:', drawer.open() === false);
drawer.unlock();
console.log('after unlock, open() succeeds:', drawer.open() === true, '| isOpen:', drawer.isOpen);

// The slide is animated, so assert it converges toward the open position.
for (let i = 0; i < 120; i++) drawer.update(1 / 60);
console.log('slides toward +Z after 2s:', drawer.group.position.z.toFixed(2), '(expect ~0.55)');
drawer.close();
for (let i = 0; i < 120; i++) drawer.update(1 / 60);
console.log('closes back to 0         :', drawer.group.position.z.toFixed(2), '(expect 0.00)');
