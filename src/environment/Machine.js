import * as THREE from 'three';

/**
 * Machine - the power unit on the east wall (Phase 8, reworked for the
 * "make the east-wall machine better" revision).
 *
 * Owns the visuals for the gear puzzle: a floor-standing cabinet with the
 * three meshing gears mounted PROUD on its west face (the whole train used
 * to be sealed inside solid boxes - literally invisible), pale index markers
 * they must reach, a crank on the driver so turning reads from across the
 * room, the keyhole that gates the drive, and a status beacon on the roof.
 *
 * The puzzle RULES live in puzzles/GearPuzzle.js. This class only reads angles
 * from it, so the rules stay testable without a renderer.
 *
 * Orientation (Laboratory places the group at (7.6, 0.75, -1.0), rotY -90°):
 * local +z points WEST into the room (the face the player reads), local +x
 * runs north-south down the wall, local +y is up. The gear train therefore
 * spans local x and every disc (its axis is local z) faces the player.
 */
export class Machine {
  /**
   * @param {object} opts
   * @param {object} opts.materials the shared material library
   * @param {import('../puzzles/GearPuzzle.js').GearPuzzle} opts.puzzle
   */
  constructor({ materials, puzzle }) {
    this.m = materials;
    this.puzzle = puzzle;

    this.group = new THREE.Group();
    this.group.name = 'Machine';

    this._buildCabinet();
    this._buildGears();
    this._buildMarkers();
    this._buildLock();
    this._buildStatusLamp();
  }

  _buildCabinet() {
    const m = this.m;

    // 1.9 m across the wall (local x), 1.5 m tall, 0.5 m deep (local z).
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 0.5), m.metal);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Gear bay on the WEST face (+z): a dark backplate inside a raised metal
    // frame, so the train reads as recessed machinery instead of being hidden
    // inside the cabinet volume.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.03), m.darkMetal);
    plate.position.set(0, 0.42, 0.26);
    plate.receiveShadow = true;
    this.group.add(plate);

    const frameParts = [
      [1.56, 0.06, 0, 0.79],    // top
      [1.56, 0.06, 0, 0.05],    // bottom
      [0.06, 0.8, -0.75, 0.42], // north end
      [0.06, 0.8, 0.75, 0.42],  // south end
    ];
    for (const [w, h, x, y] of frameParts) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), m.metal);
      bar.position.set(x, y, 0.27);
      this.group.add(bar);
    }

    // Vent slats below the bay for visual detail (they used to sit BELOW the
    // floor line - the cabinet was half-sunk into the ground).
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.02), m.darkMetal);
      slat.position.set(0, -0.1 - i * 0.09, 0.26);
      this.group.add(slat);
    }
  }

  /** Build one gear: a hub disc, radial teeth, spokes and a marked notch. */
  _makeGear(teeth, radius, thickness) {
    const gear = new THREE.Group();
    gear.name = `Gear-${teeth}`;

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.86, radius * 0.86, thickness, 24),
      this.m.metal
    );
    disc.rotation.x = Math.PI / 2; // lay the cylinder in the XY plane
    disc.castShadow = true;
    gear.add(disc);

    // Teeth as small boxes around the rim, capped at 18 so the larger gears
    // stay readable and cheap.
    const toothCount = Math.min(teeth, 18);
    for (let i = 0; i < toothCount; i++) {
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 0.22, thickness, radius * 0.26),
        this.m.darkMetal
      );
      const a = (i / toothCount) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * radius * 0.92, Math.sin(a) * radius * 0.92, 0);
      tooth.rotation.z = a;
      gear.add(tooth);
    }

    // Spokes make the rotation legible at a glance.
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 1.2, radius * 0.1, thickness * 0.6),
        this.m.darkMetal
      );
      spoke.rotation.z = (i / 4) * Math.PI;
      gear.add(spoke);
    }

    // The painted notch is what the player lines up with the fixed index mark.
    const notch = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, radius * 0.5, 0.075),
      this.m.lampOn
    );
    notch.position.set(0, radius * 0.6, 0);
    gear.add(notch);

    gear.userData.radius = radius;
    return gear;
  }

  _buildGears() {
    // Bigger gears for bigger tooth counts, so the ratios look mechanical.
    // Spacing is derived from the radii so meshing teeth just touch.
    //
    // The train spans local x (across the west face, left to right from the
    // player's view). Steps and the start offset are computed from the tooth
    // counts FIRST, so the whole train ends up centred on the bay even if the
    // puzzle is ever rebalanced. (The old code iterated a running `z` inside
    // .map() while also reading `this.gears` - still undefined there.)
    const radii = this.puzzle.teeth.map((teeth) => 0.1 + teeth * 0.008);
    const steps = [];
    for (let i = 1; i < radii.length; i++) steps.push(radii[i - 1] + radii[i] - 0.02);

    // Start so the OUTER teeth (first gear's north edge, last gear's south
    // edge) are symmetric about the bay centre.
    let x = (radii[0] - steps.reduce((a, b) => a + b, 0) - radii[radii.length - 1]) / 2;

    const gears = this.puzzle.teeth.map((teeth, i) => {
      const radius = radii[i];
      const gear = this._makeGear(teeth, radius, 0.07);
      gear.position.set(x, 0.42, 0.315); // proud of the backplate (front 0.275)
      gear.userData.index = i;
      this.group.add(gear);
      if (i < steps.length) x += steps[i];
      return gear;
    });

    this.gears = gears;
    this.driver = gears[0];

    // Crank handle on the driver: makes its rotation readable from across
    // the room (spokes alone are too subtle at distance), and gives the
    // player a clear "grab this one" target.
    const crank = new THREE.Group();
    crank.name = 'Crank';
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.03), this.m.darkMetal);
    arm.position.y = 0.08;
    crank.add(arm);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.1, 8), this.m.metal);
    grip.rotation.x = Math.PI / 2; // lay the cylinder along the gear axis
    grip.position.set(0, 0.16, 0.07);
    crank.add(grip);
    crank.position.set(0, 0, 0.05);
    this.driver.add(crank);
  }

  /** Fixed index marks, one above each gear at the "12 o'clock" position. */
  _buildMarkers() {
    // Pale painted pointers with a faint glow: the room starts DIM, so the
    // alignment target has to read before any lights come up - bare metal
    // cones on a dark plate were invisible in the dormant state.
    this.markerMat = new THREE.MeshStandardMaterial({
      color: 0xd8d2bd,
      emissive: 0x8a8570,
      emissiveIntensity: 0.35,
      roughness: 0.6,
    });
    // Assign to this.markers - the return value alone left it undefined.
    this.markers = this.gears.map((gear) => {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 4), this.markerMat);
      marker.position.set(
        gear.position.x,
        gear.position.y + gear.userData.radius + 0.08,
        gear.position.z
      );
      marker.rotation.z = Math.PI; // point down at the gear
      this.group.add(marker);
      return marker;
    });
  }

  _buildStatusLamp() {
    this.lampMat = new THREE.MeshStandardMaterial({
      color: 0x3a4248,
      emissive: 0x101418,
      emissiveIntensity: 0.1,
    });
    // Beacon on the cabinet roof. It used to float 0.4 m above the body
    // (y 1.15 with a top at 0.75) - now it sits on a small base.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.06, 10), this.m.darkMetal);
    base.position.set(0.7, 0.78, 0.05);
    this.group.add(base);

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), this.lampMat);
    lamp.position.set(0.7, 0.83, 0.05);
    this.group.add(lamp);
    this.lamp = lamp;
  }

  /**
   * Turn the driver gear.
   * @returns {boolean} true once the puzzle is solved
   */
  turnDriver(direction = 1) {
    if (this.puzzle.solved) return true;
    this.puzzle.turn(direction);
    return this.puzzle.solved;
  }

  /**
   * Keyhole plate + the brass key that releases the drive lock (user
   * revision: the key must be physically, visibly seated).
   *
   * The key starts invisible just in front of the keyhole; insertKey()
   * reveals it and update() slides it home, then turns it about its own
   * shaft - which from the player's side (looking along -z at the face)
   * reads exactly like watching a hand turn a key.
   */
  _buildLock() {
    // Key group origin = bow centre. START is held OUTSIDE the lock (and is
    // the mesh's initial position, so the collider measured from this group
    // already covers the whole insertion animation).
    this.KEY_START_Z = 0.62;
    this.KEY_SEATED_Z = 0.4; // shaft tip lands inside the plate
    this.KEY_TURN_RAD = -1.1; // clockwise seen from the room
    this.keyInserted = false;
    this._keyT = 1; // anim finished, so update() idles until insertKey()

    // Lock plate on the west face, right of the vent slats (|x| <= 0.55).
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.03), this.m.darkMetal);
    plate.position.set(0.65, -0.28, 0.2575);
    this.group.add(plate);

    const holeMat = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 1 });
    // Round bore + warded slot below = the classic keyhole silhouette.
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 12), holeMat);
    bore.rotation.x = Math.PI / 2; // cylinder axis y -> z (the face normal)
    bore.position.set(0.65, -0.27, 0.268);
    this.group.add(bore);

    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.05, 0.03), holeMat);
    slot.position.set(0.65, -0.297, 0.268);
    this.group.add(slot);

    // The brass key: bow ring (in XY, normal along z = face-on to the
    // player), shaft running toward the lock (-z), and the bit.
    const brass = new THREE.MeshStandardMaterial({
      color: 0xb08d3f,
      metalness: 0.85,
      roughness: 0.35,
    });
    const key = new THREE.Group();
    key.name = 'MachineKey';

    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 8, 20), brass);
    key.add(bow);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), brass);
    shaft.rotation.x = Math.PI / 2; // lay the cylinder along z
    shaft.position.z = -0.08;
    key.add(shaft);

    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.012), brass);
    bit.position.set(0, -0.028, -0.11); // sits at the keyhole mouth when seated
    key.add(bit);

    key.position.set(0.65, -0.28, this.KEY_START_Z);
    key.visible = false;
    this.group.add(key);
    this.key = key;

    // Invisible proxy for raycast registration (same pattern as the circuit
    // panel switches) so InteractiveObject's material cloning never touches
    // per-frame materials.
    this.keyProxy = new THREE.Group();
    this.keyProxy.name = 'MachineKeyProxy';
    this.keyProxy.position.set(0.65, -0.28, 0.3);
    this.group.add(this.keyProxy);
  }

  /** Reveal the key in front of the lock and start its insertion animation. */
  insertKey() {
    if (this.keyInserted) return;
    this.keyInserted = true;
    this.key.position.z = this.KEY_START_Z;
    this.key.rotation.z = 0;
    this.key.visible = true;
    this._keyT = 0;
  }

  /** Per-frame: ease gears toward their target angles, update the lamp. */
  update(dt) {
    this.gears.forEach((gear, i) => {
      const target = this.puzzle.angleFor(i);
      // Take the shortest path around, so a gear never spins the long way.
      const delta =
        THREE.MathUtils.euclideanModulo(target - gear.rotation.z + Math.PI, Math.PI * 2) - Math.PI;
      gear.rotation.z += delta * (1 - Math.exp(-12 * dt));
    });

    // Key insertion: slide into the keyhole (first 60% of the clip), then
    // turn about the shaft - smoothstepped so it settles like a real lock.
    if (this.keyInserted && this._keyT < 1) {
      this._keyT = Math.min(1, this._keyT + dt / 0.9);
      const t = this._keyT;
      const slide = Math.min(1, t / 0.6);
      this.key.position.z = THREE.MathUtils.lerp(this.KEY_START_Z, this.KEY_SEATED_Z, slide);
      const turn = Math.max(0, (t - 0.6) / 0.4);
      this.key.rotation.z = this.KEY_TURN_RAD * (turn * turn * (3 - 2 * turn));
    }

    const targetIntensity = this.puzzle.solved ? 3.2 : 0.1;
    this.lampMat.emissiveIntensity = THREE.MathUtils.damp(
      this.lampMat.emissiveIntensity,
      targetIntensity,
      5,
      dt
    );
    this.lampMat.emissive.setHex(this.puzzle.solved ? 0x7ff0d8 : 0x101418);
  }
}