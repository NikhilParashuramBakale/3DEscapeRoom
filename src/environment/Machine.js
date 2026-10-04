import * as THREE from 'three';

/**
 * Machine - the power unit on the east wall (Phase 8).
 *
 * Owns the visuals for the gear puzzle: the cabinet, three meshing gears, the
 * alignment markers they must reach, and a status lamp that comes on when the
 * puzzle is solved.
 *
 * The puzzle RULES live in puzzles/GearPuzzle.js. This class only reads angles
 * from it, so the rules stay testable without a renderer.
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
    this._buildStatusLamp();
  }

  _buildCabinet() {
    const m = this.m;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 1.9), m.metal);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Recessed bay so the gears sit inside the cabinet, not on its face.
    const bay = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 1.7), m.darkMetal);
    bay.position.set(0.12, 0.42, 0);
    this.group.add(bay);

    // Vent slats below the bay for visual detail.
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 1.1), m.darkMetal);
      slat.position.set(0.26, -0.1 - i * 0.09, 0);
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
    // The previous gear's radius is read from a LOCAL array, not `this.gears`:
    // `this.gears` is only assigned once `.map()` returns, so inside the
    // callback it is still undefined and indexing it throws.
    const gears = [];
    let z = -0.5;

    this.puzzle.teeth.forEach((teeth, i) => {
      const radius = 0.1 + teeth * 0.008;
      // Advance FIRST, then place. Placing first and advancing afterwards put
      // every gear at the same z, stacking them inside one another.
      if (i > 0) z += gears[i - 1].userData.radius + radius - 0.02;

      const gear = this._makeGear(teeth, radius, 0.07);
      gear.position.set(0.16, 0.42, z);
      gear.userData.index = i;
      this.group.add(gear);
      gears.push(gear);
    });

    this.gears = gears;
    this.driver = gears[0];
  }

  /** Fixed index marks, one above each gear at the "12 o'clock" position. */
  _buildMarkers() {
    // Assign to this.markers - the return value alone left it undefined.
    this.markers = this.gears.map((gear) => {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 4), this.m.metal);
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
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), this.lampMat);
    lamp.position.set(0.26, 1.15, 0.7);
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

  /** Per-frame: ease gears toward their target angles, update the lamp. */
  update(dt) {
    this.gears.forEach((gear, i) => {
      const target = this.puzzle.angleFor(i);
      // Take the shortest path around, so a gear never spins the long way.
      const delta =
        THREE.MathUtils.euclideanModulo(target - gear.rotation.z + Math.PI, Math.PI * 2) - Math.PI;
      gear.rotation.z += delta * (1 - Math.exp(-12 * dt));
    });

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