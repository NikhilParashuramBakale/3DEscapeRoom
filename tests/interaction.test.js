import * as T from 'three';

// Minimal browser stub so the browser-only listeners can be constructed.
// Must be defined before importing modules that touch the DOM at load time.
const noop = () => {};
globalThis.window = { addEventListener: noop, removeEventListener: noop };
// Materials.js / Keypad.js draw into a <canvas>.
globalThis.document = {
  // PointerLockControls listens on ownerDocument.
  addEventListener: noop, removeEventListener: noop,
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      fillStyle: '', font: '', textAlign: '', textBaseline: '', lineWidth: '',
      fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop,
      beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, arc: noop, fill: noop,
    }),
  }),
};

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

console.log('\n--- Phase 8: gear puzzle solvability ---');
import { GearPuzzle } from '../src/puzzles/GearPuzzle.js';

const gears = new GearPuzzle({ teeth: [12, 18, 12], targets: [0, 6, 0] });
console.log('teeth:', JSON.stringify(gears.teeth), 'targets:', JSON.stringify(gears.targets));

// Brute-force the full turn cycle: a puzzle with no reachable solution would
// soft-lock the player, so this must find one.
let solution = null;
for (let n = 0; n <= 360; n++) {
  const probe = new GearPuzzle({ teeth: [12, 18, 12], targets: [0, 6, 0] });
  for (let i = 0; i < n; i++) probe.turn(1);
  if (probe.solved) { solution = n; break; }
}
console.log('smallest solution (turns):', solution, '(must not be null)');

gears.turn(1);
console.log('after 1 turn, offsets    :', JSON.stringify(gears.offsets), '| aligned:', gears.alignedCount);
console.log('gear angles differ by size:', JSON.stringify(gears.teeth.map((_, i) => Number(gears.angleFor(i).toFixed(3)))));
console.log('solved while still turning:', gears.solved);

for (let i = 0; i < 11; i++) gears.turn(1);
console.log('after 12 turns, solved    :', gears.solved, '| aligned:', gears.alignedCount, '/ 3');
console.log('turning a solved puzzle is ignored:', gears.turn(1) === false);

// Turning backwards must also be able to solve it (players will try both ways).
const back = new GearPuzzle({ teeth: [12, 18, 12], targets: [0, 6, 0] });
let backSolution = null;
for (let n = 0; n <= 360; n++) {
  const probe = new GearPuzzle({ teeth: [12, 18, 12], targets: [0, 6, 0] });
  for (let i = 0; i < n; i++) probe.turn(-1);
  if (probe.solved) { backSolution = n; break; }
}
console.log('also solvable backwards  :', backSolution !== null, '(turns:', backSolution + ')');

console.log('\n--- Phase 8: Machine construction (regression) ---');
// Regression guard: _buildGears used to index `this.gears` from inside the
// .map() callback that was still building it, which threw
// "Cannot read properties of undefined (reading '0')" at startup. Unit tests
// missed it because nothing constructed Machine, so this does.
import { Machine } from '../src/environment/Machine.js';

const fakeMaterials = {
  metal: new T.MeshStandardMaterial({ color: 0x999999 }),
  darkMetal: new T.MeshStandardMaterial({ color: 0x222222 }),
  lampOn: new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfe8ff }),
};

const machine = new Machine({
  materials: fakeMaterials,
  puzzle: new GearPuzzle({ teeth: [12, 18, 12], targets: [0, 6, 0] }),
});

console.log('machine built without throwing: true');
console.log('gear count                    :', machine.gears.length, '(expect 3)');
console.log('driver assigned               :', machine.driver === machine.gears[0]);
console.log('markers built                 :', machine.markers.length, '(expect 3)');

// Gears must be spaced apart by roughly the sum of their radii, not stacked.
const zs = machine.gears.map((g) => Number(g.position.z.toFixed(3)));
const gap01 = Number((machine.gears[1].position.z - machine.gears[0].position.z).toFixed(3));
const expected01 = Number(
  (machine.gears[0].userData.radius + machine.gears[1].userData.radius - 0.02).toFixed(3)
);
console.log('gear z positions              :', JSON.stringify(zs));
console.log('gap 0->1 matches radii sum    :', gap01 === expected01, `(${gap01} vs ${expected01})`);
console.log('gears do not overlap in z     :', zs[0] < zs[1] && zs[1] < zs[2]);

// turnDriver must report the solved state, and update() must not throw.
let reported = false;
for (let i = 0; i < 12; i++) reported = machine.turnDriver(1);
console.log('turnDriver reports solved     :', reported);
for (let i = 0; i < 60; i++) machine.update(1 / 60);
console.log('update() runs cleanly         : true');
console.log('lamp is emissive once powered :', machine.lampMat.emissiveIntensity > 1);

console.log('\n--- Phase 8: full Laboratory boot (startup smoke test) ---');
// The 'Startup failed: Cannot read properties of undefined' crash only appeared
// when Laboratory constructed Machine, so exercise the whole init path here.
import { Laboratory, ROOM } from '../src/environment/Laboratory.js';
import { Keypad } from '../src/objects/Keypad.js';
// Door and Drawer are already imported above; re-importing them is a SyntaxError.

const lab = new Laboratory(new T.Scene());
console.log('Laboratory constructed         : true');
console.log('door exists & starts locked   :', lab.door instanceof Door, '|', lab.door.isLocked === true);
console.log('keypad solution derived       :', JSON.stringify(lab.keypadSolution), '(expect 24)');
console.log('keypad is an instance         :', lab.keypad instanceof Keypad);
console.log('drawer is an instance         :', lab.drawer instanceof Drawer);
console.log('machine has 3 gears           :', lab.machine.gears.length === 3);
console.log('gear puzzle present           :', lab.gearPuzzle instanceof GearPuzzle);
console.log('code sheet on the desk        :', !!lab.codeSheet);
console.log('drawer key exists & hidden    :', !!lab.drawerKey && lab.drawerKey.visible === false);
console.log('colliders registered          :', lab.colliders.length > 0);
console.log('bounds defined                :', typeof lab.bounds.minX === 'number');

// Ticking the lab must not throw (machine.update, lighting.update, door.update).
for (let i = 0; i < 10; i++) lab.update(1 / 60);
console.log('lab.update() ticks cleanly    : true');

// Lighting.setActive() is the payoff of the puzzle; it must reach full power.
lab.lighting.setActive();
for (let i = 0; i < 400; i++) lab.update(1 / 60);
console.log('lights reach active level     :', lab.lighting._level > 0.9, `(${lab.lighting._level.toFixed(2)})`);

console.log('\n--- Phase 9: escape is reachable (the original bug) ---');
// The player bounds clamped to z >= -5.4 while the escape trigger needed
// z < -5.6, so the game was unwinnable. Walk the player at the door and
// confirm the escape point is actually occupiable.
import { PlayerController } from '../src/player/PlayerController.js';

const pc = new PlayerController(new T.PerspectiveCamera(), {
  addEventListener: noop, removeEventListener: noop,
  requestPointerLock: noop, ownerDocument: globalThis.document,
});
pc.setBounds(lab.bounds);
pc.setExitZone(lab.corridorBounds);
// Use the REAL collider set, not []. Passing [] hides any furniture blocking
// the doorway - which is exactly how this test passed while the game did not.
pc.setColliders(lab.colliders);

const doorX = -0.8 + 0.8; // centre of the 1.6-wide doorway
pc.object.position.set(doorX, pc.eyeHeight, -5.4);
console.log('spawn at doorway, walkable    :', !pc._collides(doorX, -5.4));

// Step north in FINE increments. A coarse step can hop across a thin blocked
// band that continuous movement cannot cross; 0.02 is well under the player
// radius, so this matches what actually happens frame by frame.
const path = [];
for (let z = -5.4; z >= -9; z -= 0.02) {
  path.push({ z: Number(z.toFixed(2)), blocked: pc._collides(doorX, z) });
}
const firstBlocked = path.find((p) => p.blocked);
console.log('can walk north through door   :', firstBlocked === undefined);
console.log('furthest reachable z          :', firstBlocked ? firstBlocked.z : path.at(-1).z, '(need < -5.6)');

const finalZ = firstBlocked ? firstBlocked.z : path.at(-1).z;
const triggersEscape = finalZ < -5.6;
console.log('ESCAPE TRIGGER REACHABLE      :', triggersEscape);

// The zone union must have NO gap: every z between spawn and escape must be
// walkable. This is the assertion that catches flush-but-not-overlapping edges.
const gap = path.find((p) => p.blocked);
console.log('no blocked band in the union  :', gap === undefined,
  gap ? `(first gap at z=${gap.z})` : '');

// And the overlap margin itself must be real, not just flush.
// Overlap is measured as corridor.maxZ - room.minZ (positive = they overlap).
const overlap = lab.corridorBounds.maxZ - lab.bounds.minZ;
console.log('room/corridor overlap         :', overlap.toFixed(2), 'm (need > 0.4)');
console.log('overlap is sufficient         :', overlap > 0.4);

console.log('escape x window (-0.9..0.9)   :', doorX > -0.9 && doorX < 0.9);
console.log('doorway aligns with corridor  :',
  doorX >= lab.corridorBounds.minX && doorX <= lab.corridorBounds.maxX);

// Walls must still stop the player from leaving sideways.
console.log('corridor side wall blocks     :', pc._collides(lab.corridorBounds.minX - 0.3, -8.0));
console.log('corridor end wall blocks      :', pc._collides(doorX, lab.corridorBounds.minZ - 0.3));
// And the room's other sides must remain solid.
console.log('room south wall still blocks  :', pc._collides(0, lab.bounds.maxZ + 0.3));
console.log('room west wall still blocks   :', pc._collides(lab.bounds.minX - 0.3, 0));

console.log('corridor overlaps the room    :', lab.corridorBounds.maxZ > lab.bounds.minZ,
  `(corridor maxZ ${lab.corridorBounds.maxZ} vs room minZ ${lab.bounds.minZ})`);
console.log('corridor is long enough       :', lab.corridorBounds.minZ < -6.5);

console.log('\n--- Phase 9b: corridor actually emits light ---');
// The corridor lamps were decorative emissive boxes with no PointLight, so
// the ceiling rendered pure black. Assert each fixture casts real light.
console.log('corridor point lights exist    :', lab.corridorLights.length >= 2);
console.log('each light is a THREE.PointLight:', lab.corridorLights.every((l) => l.isPointLight === true));
console.log('lights have non-zero intensity :', lab.corridorLights.every((l) => l.intensity > 0));
console.log('lights have finite range       :', lab.corridorLights.every((l) => l.distance > 0 && isFinite(l.distance)));
// Lights must sit below the ceiling they are meant to illuminate.
const ceilY = 2.6;
console.log('lights sit below the ceiling  :', lab.corridorLights.every((l) => l.position.y < ceilY));
console.log('lights sit above head height  :', lab.corridorLights.every((l) => l.position.y > 1.7));
// And they must be spread along the corridor, not stacked at one end.
const lightZ = lab.corridorLights.map((l) => l.position.z);
console.log('lights spread along corridor  :', Math.abs(lightZ[0] - lightZ[1]) > 1.5);
// Nothing may reference a stale 'lamp' array here.
console.log('no leftover decorative lamps  :', !Array.isArray(lab.corridorLamps));

console.log('\n--- Phase 9c: the north wall is visible from the corridor ---');
// Regression: the north wall was built from single-sided PlaneGeometry panels
// facing inward, so from the corridor (z < -6) the camera saw culled back faces
// and the wall appeared to be missing beside the door. Every north wall segment
// must now be a solid box with real thickness.
const northWalls = [];
lab.group.traverse((o) => {
  // Only meshes actually in the north wall band; other props are 0.3 deep too.
  if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' &&
      o.geometry.parameters.depth === ROOM.wallThickness &&
      Math.abs(o.position.z - (-ROOM.depth / 2)) < 0.5) {
    northWalls.push(o);
  }
});
console.log('north wall is solid boxes    :', northWalls.length >= 3);
// Those boxes must straddle the north wall line, not sit inside the room.
const northWallZ = -ROOM.depth / 2;
console.log('wall straddles the boundary  :', northWalls.every((w) => Math.abs(w.position.z - northWallZ) < 0.4));
// And the exterior face must be behind the inner face, closing the room off.
const exteriorFace = Math.max(...northWalls.map((w) => w.position.z - ROOM.wallThickness / 2));
console.log('exterior face is outside room:', exteriorFace < northWallZ);
console.log('doorway stays clear of wall  :', !northWalls.some((w) => Math.abs(w.position.x) < 0.86 - ROOM.wallThickness / 2 && w.position.y < 2.72));
// The corridor must start at the exterior face, not overlap the room interior.
console.log('corridor starts outside wall :', lab.corridorBounds.maxZ > northWallZ);

console.log('\n--- Phase 9e: no z-fighting in the north wall ---');
// Regression: the jamb boxes (x 0.86..1.16) were embedded INSIDE the side wall
// panels (x 0.86..8.0), so their front/back faces were exactly coplanar at
// z = -6.3 / z = -6.0. Coincident depth values z-fight, which showed as fine
// vertical stripes crawling across the doorway - not a shadow or lighting
// artefact at all. Every north wall box must now be disjoint in x.
const wallBoxes = [];
lab.group.traverse((o) => {
  if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' &&
      o.geometry.parameters.depth === ROOM.wallThickness &&
      Math.abs(o.position.z - northWallZ) < 0.5) {
    wallBoxes.push(o);
  }
});
// Build an x-interval for each box and assert no two overlap in their interior.
const spans = wallBoxes.map((w) => {
  const hx = w.geometry.parameters.width / 2;
  return { min: w.position.x - hx, max: w.position.x + hx, y: w.position.y, h: w.geometry.parameters.height };
});
let overlaps = 0;
for (let i = 0; i < spans.length; i++) {
  for (let j = i + 1; j < spans.length; j++) {
    const a = spans[i];
    const b = spans[j];
    if (a.min < b.max - 1e-6 && b.min < a.max - 1e-6) overlaps++;
  }
}
console.log('no two wall boxes overlap in x:', overlaps === 0);
// The doorway must still be exactly doorW wide and clear of masonry.
const doorwayBoxes = wallBoxes.filter((w) => w.geometry.parameters.width < ROOM.width / 2);
console.log('doorway still clear         :', doorwayBoxes.length >= 3);
// The panels must still reach the room corners, so nothing is left open.
const reachesCorner = spans.some((s) => Math.abs(s.min + ROOM.width / 2) < 1e-6) &&
                      spans.some((s) => Math.abs(s.max - ROOM.width / 2) < 1e-6);
console.log('wall still reaches corners  :', reachesCorner);

// Regression: the jambs used to stop at the 2.72 door head height, but the
// lintel only covers |x| <= 0.86 and the side panels start at x = 1.16. The
// corners x 0.86..1.16, y 2.72..H were therefore left open - a visible gap in
// each top corner beside the door. Every jamb must now reach the ceiling.
const jambs = wallBoxes.filter((w) => w.geometry.parameters.width === ROOM.wallThickness);
console.log('jambs reach the ceiling    :',
  jambs.length === 2 && jambs.every((j) => Math.abs(
    (j.position.y + j.geometry.parameters.height / 2) - ROOM.height) < 1e-6));

console.log('\n--- Phase 9d: no shadow acne / strobing flicker ---');
// Regression: large flat walls shimmered under the directional + desk shadow
// casters (bias -0.0005 with no normalBias on a 1024 map), and the exit tube
// strobed the doorway because it dropped to 0.05 on 40% of rolls. Both read as
// the geometry "blinking".
const shadowCasters = [];
lab.group.parent.traverse((o) => {
  if (o.isLight && o.castShadow) shadowCasters.push(o);
});
console.log('shadow casters found        :', shadowCasters.length >= 2);
// normalBias is the real fix for acne; a bare negative bias is not enough.
console.log('every caster has normalBias :', shadowCasters.every((l) => l.shadow.normalBias > 0));
console.log('no caster uses a raw -0.0005:', shadowCasters.every((l) => l.shadow.bias > -0.0005));
// The flicker must be OFF by default: the failing tube is directly above the
// exit door, so even a gentle dip washes over the doorway and reads as the
// geometry blinking. Verify the steady state first.
const lit = lab.lighting;
console.log('flicker off by default      :', lit.flickerEnabled === false);
const steady = [];
for (let i = 0; i < 200; i++) {
  lit._flickerTimer = 0;      // force a re-roll every sample
  lit.update(0.016);
  steady.push(lit._flickerValue);
}
console.log('scene is perfectly steady   :', steady.every((v) => v === 1));

// With flicker opted in it must still be bounded - it may never black the room
// out, must still animate, and its windows must be long enough to read as a
// failing lamp rather than frame noise.
lit.setFlickerEnabled(true);
console.log('flicker is opt-in           :', lit.flickerEnabled === true);
const samples = [];
for (let i = 0; i < 400; i++) {
  lit._flickerTimer = 0;      // force a re-roll every sample
  lit.update(0.016);
  samples.push(lit._flickerValue);
}
console.log('flicker never goes dark     :', Math.min(...samples) >= 0.3);

console.log('\n--- Phase 10: completion screen ---');
// The escape used to end the game with a 9-second toast and nothing else: no
// summary, no acknowledgement, and the player was left standing in an
// unbounded corridor with every objective already complete. Phase 10 replaces
// that with a real completion overlay, so test its pieces.
import { EndScreen, formatDuration } from '../src/ui/EndScreen.js';

// The shared document stub above only models <canvas>. The UI panels are plain
// DOM, so give createElement a small element model for this block.
const classListFor = (el) => ({
  _set: new Set(el._classes || []),
  add(...c) { this._set.add(c.join(' ')); el._classes = [...this._set]; },
  remove(...c) { for (const n of c) this._set.delete(n); el._classes = [...this._set]; },
  contains(c) { return this._set.has(c); },
  toggle(c, on) { on ? this.add(c) : this.remove(c); },
});
const makeEl = (tag) => ({
  tag, _classes: [], textContent: '', innerHTML: '', offsetWidth: 0,
  value: '', checked: false, type: '', listeners: {},
  classList: null,
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
  appendChild() {},
  focus() {},
  setAttribute() {},
  click() { for (const fn of this.listeners.click || []) fn(); },
  // Fire a named listener, e.g. to simulate 'input' / 'change' on a slider.
  fire(t) { for (const fn of this.listeners[t] || []) fn({ target: this }); },
  // The panel looks up several stat slots and buttons by class or id; hand back
  // a stable child per selector so listeners attach somewhere real.
  _children: {},
  querySelector(sel) {
    this._children[sel] ||= makeEl('div');
    return this._children[sel];
  },
});
const realCreate = globalThis.document.createElement;
globalThis.document.createElement = (tag) => {
  const el = makeEl(tag);
  el.classList = classListFor(el);
  return el;
};

// formatDuration is exported so the clock formatting can be checked directly.
const cases = [[0, '0:00'], [5, '0:05'], [59.9, '0:59'], [60, '1:00'], [125, '2:05'],
  [3599, '59:59'], [3600, '1:00:00'], [3725, '1:02:05']];
const fmtOk = cases.every(([s, want]) => formatDuration(s) === want);
console.log('duration formats as m:ss / h:mm:ss:', fmtOk);
if (!fmtOk) {
  for (const [s, want] of cases) {
    const got = formatDuration(s);
    if (got !== want) console.log(`  ${s}s -> "${got}" (want "${want}")`);
  }
}
// It must never show a negative or NaN time if called with a bad value.
console.log('duration clamps bad input   :', formatDuration(-5) === '0:00' && formatDuration(NaN) === '0:00');

// The panel must reveal itself, block input and release the pointer so the
// single button is actually clickable.
const playerStub = {
  blocked: false, locks: 0,
  controls: { isLocked: true, unlock() { this.isLocked = false; } },
  setBlocked(v) { this.blocked = v; },
};
let restarts = 0;
const screen = new EndScreen({ appendChild() {} }, {
  player: playerStub,
  onRestart: () => restarts++,
});
console.log('hidden before the escape    :', screen.isOpen === false);
screen.show({ seconds: 125, gearTurns: 6, objectivesDone: 6, objectivesTotal: 6 });
console.log('opens on show               :', screen.isOpen === true);
console.log('blocks player control       :', playerStub.blocked === true);
console.log('releases the pointer        :', playerStub.controls.isLocked === false);
// Showing twice must be a no-op, or a re-triggered escape would re-animate.
screen.show({ seconds: 999 });
console.log('second show is a no-op      :', screen.isOpen === true);
screen.restartBtn.click();
console.log('restart button fires handler:', restarts === 1);
globalThis.document.createElement = realCreate;

console.log('\n--- Phase 10: run statistics wiring ---');
// Game must count gear turns and freeze the clock at the moment of escape, then
// derive the objective tally from GameState rather than hard-coding it.
const gameSrc = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/core/Game.js', import.meta.url), 'utf8'));
console.log('counts gear turns           :', /this\.gearTurns\+\+/.test(gameSrc));
console.log('freezes the clock on escape :', /runSeconds\s*=\s*Math\.max\(0,\s*this\._elapsed - this\.runStartedAt\)/.test(gameSrc));
console.log('derives objectives from state:', /OBJECTIVES\.filter\(\(o\) => this\.gameState\[o\.flag\]\)/.test(gameSrc));
// The old 9-second escape toast must be gone, or it would sit on top of the
// completion card for the first half of the fade-in.
console.log('no leftover escape toast    :', !/You step into the dark corridor/.test(gameSrc));

console.log('\n--- Phase 10: doorway closes the opening ---');
// Regression: the door leaf was declared 2.6 m tall while the opening head is at
// 2.72 m and the frame head adds another 0.07 m. That left a 0.05 m slot of open
// air above the door, through which the unlit corridor showed as a dark line
// painted across the wall right under the EXIT sign. Leaf + frame must now land
// exactly on the opening head.
import { DOOR_FRAME_T, DOOR_OPENING_H } from '../src/objects/Door.js';
console.log('leaf + frame meets the head  :',
  Math.abs((lab.door.height + DOOR_FRAME_T) - DOOR_OPENING_H) < 1e-9);
console.log('no slot above the door      :', lab.door.height + DOOR_FRAME_T >= DOOR_OPENING_H);
// The lintel must start at that same head height.
const lintelMesh = northWalls.find((w) => w.geometry.parameters.height > 0.1 &&
  Math.abs(w.position.x) < 1e-6);
console.log('lintel starts at the head   :',
  Math.abs((lintelMesh.position.y - lintelMesh.geometry.parameters.height / 2) - DOOR_OPENING_H) < 1e-6);

// The reinforcing bars are intentional - they stay.
const pivotParts = lab.door.pivot.children;
console.log('bars are still on the leaf  :',
  pivotParts.filter((p) => p.geometry.parameters.depth === 0.02).length === 2);

console.log('\n--- Phase 11: sound ---');
// Sound is a mandatory viva item and was entirely absent. Every effect is
// synthesised, so these tests drive a fake AudioContext and assert the graph is
// built and the lifecycle is safe without a real device.
import { AudioManager } from '../src/audio/AudioManager.js';

const nodes = [];
const nodeFactory = () => ({
  connect(n) { nodes.push(n); },
  disconnect() {},
  start() {}, stop() {},
  gain: {
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
    setTargetAtTime() {},
  },
  frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
  Q: { value: 0 },
  type: '', buffer: null, loop: false,
});
let resumes = 0;
globalThis.AudioContext = class {
  constructor() {
    this.state = 'running';
    this.sampleRate = 44100;
    // The real context exposes a monotonic clock; the rate limiter and every
    // envelope schedule off it, so a stub without one is useless here.
    this.currentTime = 0;
    this.destination = nodeFactory();
  }
  createGain() { return nodeFactory(); }
  createOscillator() { return nodeFactory(); }
  createBiquadFilter() { return nodeFactory(); }
  createBufferSource() { return nodeFactory(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  resume() { resumes++; return Promise.resolve(); this.state = 'running'; }
};

const audio = new AudioManager();
console.log('silent before any gesture  :', audio.isReady === false);
// Every sound method must be a safe no-op before unlock - the game calls these
// from interaction handlers that can fire before the player has clicked.
let threw = false;
try {
  audio.keypadPress('digit'); audio.keypadReject(); audio.keypadAccept();
  audio.drawerOpen(); audio.pickup(); audio.gearTurn(); audio.powerOn();
  audio.doorOpen(); audio.doorClose(); audio.doorUnlock(); audio.footstep(); audio.escape();
  audio.uiClick(); audio.startAmbience();
} catch (e) { threw = true; }
console.log('pre-unlock calls are safe :', threw === false);

const unlocked = audio.unlock();
console.log('unlock creates a context  :', audio.ctx !== null);
console.log('context reports running   :', audio.isReady === true && unlocked === true);
console.log('unlock is idempotent      :', audio.unlock() === true && audio.ctx !== null);

// Effects must actually build nodes once audio is live.
nodes.length = 0;
audio.keypadPress('digit');
console.log('keypad press builds nodes :', nodes.length >= 2);
nodes.length = 0;
audio.powerOn();
console.log('power-on builds nodes      :', nodes.length > 0);
console.log('power-on starts ambience  :', audio.ambiencePlaying === true);

// Calling startAmbience twice must not stack a second drone.
audio.startAmbience(0.5);
console.log('ambience does not stack   :', audio.ambiencePlaying === true);
audio.stopAmbience();
console.log('ambience can be stopped   :', audio.ambiencePlaying === false);

// The door swings BOTH ways. Opening had a sound while closing was silent,
// which made the leaf feel weightless - the player shut it and heard nothing.
// Both directions must be audible.
nodes.length = 0;
audio.doorOpen();
const openNodes = nodes.length;
nodes.length = 0;
audio.doorClose();
console.log('door opens audibly         :', openNodes > 0);
console.log('door closes audibly        :', nodes.length > 0);
// The closing sound must end on a DELAYED latch click, otherwise the swing and
// the latch are simultaneous and the door sounds like it vanishes rather than
// closes. Capture the scheduling delays a burst is actually created with.
const delaysOf = (kind) => {
  const seen = [];
  const realNow = Object.getOwnPropertyDescriptor(audio.ctx, 'currentTime');
  const origTone = audio._noiseBurst.bind(audio);
  audio._noiseBurst = (o) => { seen.push(o.delay || 0); origTone(o); };
  audio[kind]();
  audio._noiseBurst = origTone;
  void realNow;
  return seen;
};
const closeDelays = delaysOf('doorClose');
console.log('close has a delayed latch  :', closeDelays.some((d) => d > 0.3));

// Footsteps are distance driven, so a burst of calls must be rate limited or
// they turn into a continuous buzz.
nodes.length = 0;
audio.footstep();
const afterFirst = nodes.length;
audio.footstep(); audio.footstep(); audio.footstep();
console.log('footsteps are rate limited :', afterFirst > 0 && nodes.length === afterFirst);

// Mute must reach the master gain.
audio.setEnabled(false);
console.log('mute drops master gain    :', audio.enabled === false);
audio.setEnabled(true);
// Volume must clamp rather than accept nonsense.
audio.setVolume(5); const hi = audio.volume;
audio.setVolume(-5); const lo = audio.volume;
console.log('volume clamps to 0..1     :', hi === 1 && lo === 0);

// And every public effect name the game calls must actually exist.
const expected = ['keypadPress', 'keypadReject', 'keypadAccept', 'drawerOpen', 'pickup',
  'gearTurn', 'powerOn', 'doorOpen', 'doorClose', 'doorUnlock', 'footstep', 'escape', 'uiClick',
  'startAmbience', 'stopAmbience', 'unlock', 'setEnabled', 'setVolume'];
console.log('all game sounds exist      :', expected.every((m) => typeof audio[m] === 'function'));

console.log('\n--- Phase 11: sound wiring ---');
const gameSrc2 = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/core/Game.js', import.meta.url), 'utf8'));
// The autoplay policy is the classic Phase 11 bug: an AudioContext built in the
// constructor starts suspended and every sound is silently dropped. It must be
// created lazily on a real gesture.
console.log('unlocked on pointer lock   :', /pointerlockchange[\s\S]*?this\.audio\.unlock\(\)/.test(gameSrc2));
console.log('unlocked on first gesture  :', /addEventListener\('pointerdown', tryUnlock/.test(gameSrc2));
// Footsteps must come from the player, distance driven.
console.log('footsteps wired to player  :', /onFootstep\s*=\s*\(\)\s*=>\s*this\.audio\.footstep\(\)/.test(gameSrc2));
const playerSrc = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/player/PlayerController.js', import.meta.url), 'utf8'));
console.log('steps driven by distance   :', /_stepDistance >= STRIDE_LENGTH/.test(playerSrc));
// The sound toggle must be pointer-events:none or it steals the relock click.
const cssSrc = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8'));
const toggleStart = cssSrc.indexOf('#audio-toggle {');
// The rule carries an explanatory comment, so the window has to be generous
// enough to reach the pointer-events declaration inside the block.
const toggleBlock = cssSrc.slice(toggleStart, toggleStart + 700);
console.log('toggle never eats clicks   :', /pointer-events:\s*none/.test(toggleBlock));

console.log('\n--- Phase 12: lighting polish ---');
// Regression: the corridor PointLights were constructed and then never touched
// by Lighting.update(), so they stayed at a fixed intensity for the entire run.
// The lab visibly powered up behind the player while the escape route remained
// dead dark - an obvious inconsistency, not a stylistic choice.
const lab12 = lab;
console.log('corridor lights registered  :', lab12.lighting.aux.length === lab12.corridorLights.length);
console.log('every corridor light driven :', lab12.corridorLights.every(
  (l) => lab12.lighting.aux.some((a) => a.light === l)));

// They must actually DIM in the dormant state and BRIGHTEN once powered.
const corridorLight = lab12.corridorLights[0];
lab12.lighting.setDormant();
for (let i = 0; i < 300; i++) lab12.lighting.update(1 / 60);
const dormantIntensity = corridorLight.intensity;
lab12.lighting.setActive();
for (let i = 0; i < 300; i++) lab12.lighting.update(1 / 60);
const activeIntensity = corridorLight.intensity;
console.log('corridor dims when dormant :', dormantIntensity < 14 * 0.5);
console.log('corridor brightens on power:', activeIntensity > dormantIntensity * 2);

// The corridor must remain darker than the lab once powered, so the exit still
// reads as the dark place you are walking out of.
let labTube = 0;
lab12.lighting.lamps.forEach((l) => { labTube = Math.max(labTube, l.light.intensity); });
console.log('corridor stays darker       :', activeIntensity < labTube);

// Hand the lighting rig back in its original dormant state. This block leaves
// the room powered, and the flicker checks that follow assert the dormant
// behaviour (where the stutter window is short) - leaving it active would
// change their expected timings.
lab12.lighting.setDormant();
lab12.lighting.setFlickerEnabled(false);
// Snap the animated values instead of waiting on the damped transition: the
// flicker window is chosen from `this._active`, which is still ~1 from the
// power-on above and would otherwise keep lengthening the window.
lab12.lighting._active = 0;
lab12.lighting._level = 0.35;
lab12.lighting.update(1 / 60);
// Re-enable the opt-in flicker: the checks after this block assert it animates
// and that its window is long enough. While it is disabled `update()` skips
// scheduling entirely, so the window would read as 0 and fail.
lab12.lighting.setFlickerEnabled(true);

console.log('\n--- Phase 13: settings panel ---');
// Regression risks this phase has to lock down: localStorage may throw (private
// mode / disabled), Esc must not steal the key from a puzzle modal, and the
// projection matrix must actually be rebuilt when the FOV slider moves.
import { SettingsPanel, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/ui/SettingsPanel.js';

const store = new Map();
// The richer DOM stub installed for the EndScreen block is uninstalled by now,
// so reinstall it here: SettingsPanel builds real inputs and buttons.
globalThis.document.createElement = (tag) => {
  const el = makeEl(tag);
  el.classList = classListFor(el);
  return el;
};
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
console.log('defaults on first run      :',
  loadSettings().fov === DEFAULT_SETTINGS.fov && loadSettings().sensitivity === 1);
console.log('settings persist           :', saveSettings({ fov: 90 }) === true &&
  loadSettings().fov === 90);

// A file saved by an older build may be missing keys added later. It must merge
// with the defaults rather than yielding undefined for those fields.
store.set('forgotten-lab.settings', JSON.stringify({ fov: 88 }));
const merged = loadSettings();
console.log('partial saves merge safely :', merged.fov === 88 && merged.volume === DEFAULT_SETTINGS.volume);

// Storage that throws must never take the game down.
globalThis.localStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
};
let storageThrew = false;
try { loadSettings(); saveSettings({}); } catch { storageThrew = true; }
console.log('throwing storage is survivable:', storageThrew === false);
console.log('throwing storage falls back:', loadSettings().fov === DEFAULT_SETTINGS.fov);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

// The panel must build, open, and report changes.
const changed = {};
const playerStub13 = { controls: { isLocked: false, unlock() { this.isLocked = false; } } };
const panel13 = new SettingsPanel({ appendChild() {} }, {
  player: playerStub13,
  onChange: (k, v) => { changed[k] = v; },
});
console.log('panel starts closed        :', panel13.isOpen === false);
panel13.open();
console.log('panel opens                :', panel13.isOpen === true);
panel13.resumeBtn.click();
console.log('resume closes it           :', panel13.isOpen === false);
console.log('opening twice is safe      :', (panel13.open(), panel13.open(), panel13.isOpen === true));

// Sliders: 'input' drives the readout, 'change' reports the value. Reporting on
// 'input' would rebuild the projection matrix on every mouse movement.
panel13.fovEl.value = '95';
panel13.fovEl.fire('input');
console.log('drag does not report yet  :', changed.fov === undefined);
panel13.fovEl.fire('change');
console.log('release reports the value :', changed.fov === 95);
panel13.shadowsEl.checked = false;
panel13.shadowsEl.fire('change');
console.log('shadow toggle reports     :', changed.shadows === false);

// applySettings must write values back into the controls.
panel13.applySettings({ sensitivity: 2.4, fov: 88, volume: 0.25, shadows: false });
console.log('applySettings fills inputs:', panel13.fovEl.value === 88 &&
  panel13.sensitivityEl.value === 2.4 && panel13.shadowsEl.checked === false);

// The stored settings shape must match what Game applies.
console.log('settings keys are expected :',
  Object.keys(DEFAULT_SETTINGS).every((k) => typeof DEFAULT_SETTINGS[k] === (k === 'shadows' ? 'boolean' : 'number')));
console.log('\n--- Phase 14: optimization ---');
// Measure the real scene rather than guessing at bottlenecks. The brief calls
// for a comfortable 60 fps on an RTX 4050 laptop, so the two costs that matter
// are draw calls (how many meshes get submitted) and shadow casters (how many
// times the shadow pass redraws the scene).
const sceneLab = lab.group.parent || lab.group;
let meshCount = 0;
let triCount = 0;
const materialSet = new Set();
const geomSet = new Set();
sceneLab.traverse((o) => {
  if (!o.isMesh) return;
  meshCount++;
  const g = o.geometry;
  if (g) {
    geomSet.add(g.uuid);
    const pos = g.attributes && g.attributes.position;
    // Non-indexed boxes report position.count as the vertex count; indexed
    // geometry needs the index length to get a true triangle count.
    const tris = g.index ? g.index.count / 3 : (pos ? pos.count / 3 : 0);
    triCount += tris;
  }
  // Count each distinct material once - sharing is what keeps draw calls down.
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  for (const m of mats) if (m) materialSet.add(m.uuid);
});

console.log('meshes in scene            :', meshCount, `(~${meshCount} draw calls)`);
console.log('triangles in scene         :', Math.round(triCount));
console.log('distinct materials         :', materialSet.size);
console.log('shared geometries          :', geomSet.size, 'of', meshCount, 'meshes');

// Shadow casters are the multiplier: each one redraws the whole scene into its
// own shadow map, so this count dominates GPU cost far more than the mesh count.
let casters = 0;
let shadowLights = 0;
sceneLab.traverse((o) => {
  if (o.isLight && o.castShadow) {
    shadowLights++;
    casters++;
  }
});
console.log('shadow-casting lights      :', shadowLights, '(budget <= 2)');
console.log('shadow budget respected    :', shadowLights <= 2);

// Nothing here should be a high-poly asset: the brief asks for a low/medium
// poly environment that runs comfortably on a laptop.
console.log('triangle budget respected  :', triCount < 120000);

console.log('\n--- Phase 14: frame-loop hygiene ---');
// Renderer settings that cost real performance if left on.
const smSrc = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/core/SceneManager.js', import.meta.url), 'utf8'));
// devicePixelRatio must be clamped: an uncapped 3x phone ratio quadruples the
// fill cost of every full-screen pass.
console.log('pixel ratio is clamped     :', /setPixelRatio\(Math\.min\(window\.devicePixelRatio,\s*2\)\)/.test(smSrc));
// Shadows should be PCFSoft at a bounded map size, not PCFSoftSoft/VSM which
// are far more expensive per pixel.
console.log('shadow filtering is sane   :', /shadowMap\.type = THREE\.PCFSoftShadowMap/.test(smSrc));
// The map sizes live in Lighting.js, where the shadow-casting lights are
// configured - not in SceneManager.
const lightSrc = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/environment/Lighting.js', import.meta.url), 'utf8'));
console.log('shadow map size is bounded :', /mapSize\.set\(2048, 2048\)/.test(lightSrc) &&
  /mapSize\.set\(1024, 1024\)/.test(lightSrc));

// Material.needsUpdate is expensive (it forces a shader recompile). It must
// never sit in the per-frame update path.
const gameSrc14 = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/core/Game.js', import.meta.url), 'utf8'));
const updateBody = gameSrc14.slice(gameSrc14.indexOf('_update(dt, elapsed)'));
const perFrame = updateBody.slice(0, updateBody.indexOf('\n  _updateFps'));
console.log('no shader recompile per frame:', !/needsUpdate/.test(perFrame));

console.log('\n--- Phase 14: sharing ---');
// _addTube built a fresh material AND a fresh BoxGeometry for every ceiling
// fixture. Four identical-looking lamps meant four identical shaders and four
// copies of the same vertices. Both are now shared instances.
const lighting14 = new (Object.getPrototypeOf(lab.lighting).constructor)(new T.Scene());
const housings = [];
lighting14.scene.traverse((o) => { if (o.isMesh && o.geometry.parameters && o.geometry.parameters.width === 1.6) housings.push(o); });
console.log('lamp housings found        :', housings.length >= 4, `(${housings.length})`);
console.log('housing material is shared :',
  housings.length >= 2 && housings.every((h) => h.material === housings[0].material));
console.log('housing geometry is shared :',
  housings.length >= 2 && housings.every((h) => h.geometry === housings[0].geometry));

// The tube emissive materials must stay SEPARATE: update() writes a different
// emissiveIntensity into each one as the room level and flicker change. Sharing
// them would make all four tubes pulse identically and break the flicker.
const tubes = [];
lighting14.scene.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry') tubes.push(o); });
console.log('tube materials stay unique :',
  tubes.length >= 2 && new Set(tubes.map((t) => t.material)).size === tubes.length);

console.log('\n--- Phase 14: raycast gating ---');
// With a modal open the raycast result is thrown away, so it must be skipped.
const imSrc = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../src/interaction/InteractionManager.js', import.meta.url), 'utf8'));
// Parse the real code, not the prose: the explanatory comments mention both
// 'player.blocked' and 'intersectObjects', so a plain indexOf picks the comment
// text and compares the wrong offsets. Strip comments first, then locate the
// actual statements.
const updStart = imSrc.indexOf('/** Per-frame: raycast');
const rawBody = imSrc.slice(updStart, updStart + 2000);
const codeBody = rawBody.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const gateRe = /if\s*\(\s*this\.player\s*&&\s*this\.player\.blocked\s*\)[\s\S]*?return;/;
const gate = codeBody.match(gateRe);
const castPos = codeBody.indexOf('intersectObjects');
console.log('raycast skipped when blocked:',
  !!gate && castPos > -1 && gate.index < castPos);
// It must NOT be gated on pointer lock: the crosshair should still highlight
// while the player is simply not holding the mouse button.
console.log('not gated on pointer lock  :', !/isLocked[\s\S]{0,200}intersectObjects/.test(codeBody));

console.log('flicker is still animating  :', new Set(samples).size > 1);
console.log('flicker reaches full power  :', Math.max(...samples) === 1);
// The stutter window must be long enough to read as a lamp, not frame noise.
lit._flickerTimer = 0;
lit.update(0.016);
console.log('flicker window >= 0.25s    :', lit._flickerTimer >= 0.25);
// Turning it back off must immediately restore a constant value.
lit.setFlickerEnabled(false);
lit.update(0.016);
console.log('re-disable restores steady  :', lit._flickerValue === 1);

