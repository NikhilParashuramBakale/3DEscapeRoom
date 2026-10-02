import * as THREE from 'three';

/**
 * Lighting - the laboratory light rig.
 *
 * Demonstrates the main Three.js light types plus dynamic behaviour:
 *   - HemisphereLight : cheap ambient fill (cool sky / dark ground)
 *   - DirectionalLight: the ONLY general shadow-caster
 *   - PointLight      : inside each ceiling lamp fixture
 *   - SpotLight       : focused pools of light (desk, machine bay, exit)
 *   - EmissiveMesh    : the glowing tube surfaces themselves
 *
 * Performance: shadows are limited to 2 casters (one directional + one
 * spot). Every other light is shadowless, which keeps this smooth on a
 * laptop GPU.
 *
 * States: 'dormant' (dim, one tube flickering) and 'active' (full power,
 * used after the machine switches on). setState() animates smoothly between
 * them instead of snapping, and update(dt) drives flicker + transitions.
 */
export class Lighting {
  constructor(scene) {
    this.scene = scene;
    this.lamps = [];
    this.spots = [];

    // Current (animated) and target multipliers for the room.
    // Note: the room still needs to read as "dim and abandoned", but the
    // dormant level must stay high enough that surfaces are actually
    // visible. This is a floor, not near-black.
    this._level = 0.75;
    this._targetLevel = 0.75;
    this._active = 0;
    this._targetActive = 0;

    this._flickerTimer = 0;
    this._flickerValue = 1;
    this._flickerLamp = null;

    this._build();
  }

  _build() {
    // ---- Ambient fill ----------------------------------------------------
    // Generous ambient so no surface is ever fully black.
    const hemi = new THREE.HemisphereLight(0x9fc0e8, 0x2a3038, 0.75);
    this.scene.add(hemi);
    this.hemi = hemi;

    // ---- General shadows (single directional caster) --------------------
    const dir = new THREE.DirectionalLight(0xcfe0f5, 0.9);
    dir.position.set(5, 9, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -10;
    dir.shadow.camera.right = 10;
    dir.shadow.camera.top = 10;
    dir.shadow.camera.bottom = -10;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 30;
    dir.shadow.bias = -0.0005;
    this.scene.add(dir);
    this.dir = dir;

    // ---- Ceiling fluorescent tubes -------------------------------------
    // Each tube is a real mesh with an emissive material + a point light.
    // Intensities are in physical units (Three.js r155+), so these numbers
    // are much larger than the pre-r155 defaults.
    this._addTube(-4.5, 3.15, 2.5, 0xbfe0ff, 26); // west, near the desk
    this._addTube(1.5, 3.15, 0.0, 0xbfe0ff, 26); // centre
    this._addTube(6.0, 3.15, -2.5, 0xffd9a0, 24); // east, warmer (machine bay)
    this._addTube(-1.0, 3.15, -4.5, 0xbfe0ff, 22); // near the exit

    // The tube nearest the exit is the one that flickers (abandoned lab).
    this._flickerLamp = this.lamps[this.lamps.length - 1];

    // ---- Focus spots ----------------------------------------------------
    // Desk pool of light (shadow casting).
    this._addSpot({ x: -5.5, y: 3.1, z: 0, tx: -5.5, tz: 0, color: 0xdfefff, intensity: 70, shadow: true });

    // Machine bay (east wall) - ready for Phase 9, currently a weak standby.
    this.machineSpot = this._addSpot({
      x: 6.2, y: 2.9, z: -1.0, tx: 7.0, tz: -1.0, color: 0x8fd0ff, intensity: 18, shadow: false,
    });

    // Door / exit area spot: cool, highlights the final door.
    this.exitSpot = this._addSpot({
      x: 0, y: 3.0, z: -4.6, tx: 0, tz: -6.0, color: 0xa8c8ff, intensity: 30, shadow: false,
    });
  }

  /**
   * A fluorescent ceiling tube: housing + glowing tube + point light.
   * Demonstrates an emissive material paired with a real light source.
   */
  _addTube(x, y, z, color, intensity) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Metal housing
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x9aa3aa, roughness: 0.5, metalness: 0.7 })
    );
    housing.position.y = 0.08;
    group.add(housing);

    // The glowing tube itself. Emissive is tone-mapped in the shader, so it
    // needs a high value to read as a genuinely bright light source.
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveIntensity: 6.0,
      roughness: 0.3,
    });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 10), tubeMat);
    tube.rotation.z = Math.PI / 2; // lie the tube horizontally
    group.add(tube);

    // Actual illumination. decay 1.6 (softer than inverse-square) keeps the
    // floor lit further out from directly under the tube.
    const light = new THREE.PointLight(color, intensity, 16, 1.6);
    light.position.y = -0.1;
    group.add(light);

    this.scene.add(group);
    this.lamps.push({ light, tube, tubeMat, baseIntensity: intensity, baseEmissive: 6.0 });
  }

  _addSpot({ x, y, z, tx, tz, color, intensity, shadow }) {
    const spot = new THREE.SpotLight(color, intensity, 12, Math.PI / 5, 0.5, 1.6);
    spot.position.set(x, y, z);
    spot.target.position.set(tx, 0.7, tz);
    if (shadow) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0005;
    }
    this.scene.add(spot);
    this.scene.add(spot.target);
    this.spots.push({ light: spot, baseIntensity: intensity });
    return spot;
  }

  /** Switch the room to the dim, abandoned look. */
  setDormant() {
    this._targetActive = 0;
    this._targetLevel = 0.35;
  }

  /** Switch the room to full power (after the machine activates). */
  setActive() {
    this._targetActive = 1;
    this._targetLevel = 1;
  }

  /**
   * Per-frame update: smooth state transitions + the flickering tube.
   */
  update(dt) {
    // Smoothly approach the target room level.
    this._level = THREE.MathUtils.damp(this._level, this._targetLevel, 1.6, dt);
    this._active = THREE.MathUtils.damp(this._active, this._targetActive, 1.6, dt);

    // Ambient + general shadow light scale with the room level, but stay
    // within a range that always keeps geometry readable.
    this.hemi.intensity = 0.5 + 0.35 * this._level;
    this.dir.intensity = 0.6 + 0.5 * this._level;

    // Flicker: the exit tube stutters irregularly while the room is dim,
    // and settles down once the lights are fully on.
    this._flickerTimer -= dt;
    if (this._flickerTimer <= 0) {
      const roll = Math.random();
      if (roll < 0.25) this._flickerValue = Math.random() * 0.25; // stutter
      else if (roll < 0.4) this._flickerValue = 0.05; // near black
      else this._flickerValue = 1; // steady
      this._flickerTimer = 0.05 + Math.random() * (this._active > 0.5 ? 3.5 : 0.5);
    }

    // Apply level + flicker to every lamp.
    for (const lamp of this.lamps) {
      const f = lamp === this._flickerLamp ? this._flickerValue : 1;
      lamp.light.intensity = lamp.baseIntensity * this._level * f;
      lamp.tubeMat.emissiveIntensity = lamp.baseEmissive * this._level * f;
    }

    // Spots follow the room, but the machine bay also responds to activation.
    for (const s of this.spots) {
      let k = this._level;
      if (s.light === this.machineSpot) k = 0.25 + 0.75 * this._active;
      s.light.intensity = s.baseIntensity * k;
    }
  }
}
