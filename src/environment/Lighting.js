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
    // Lights adopted from other builders (the corridor fixtures).
    this.aux = [];

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

    // Flicker is OFF by default. The failing tube sits at (-1.0, 3.15, -4.5),
    // directly above the exit door, so any dip at all lights the whole doorway -
    // and because the door is a large flat surface the player reads it as the
    // geometry blinking rather than the lamp failing. It is kept as an opt-in
    // atmosphere switch via setFlickerEnabled() so the look is a deliberate
    // choice instead of an unavoidable pulsing.
    this._flickerEnabled = false;

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
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -12;
    dir.shadow.camera.right = 12;
    dir.shadow.camera.top = 12;
    dir.shadow.camera.bottom = -12;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 34;
    // A negative bias alone leaves large flat surfaces (walls, floor, ceiling)
    // self-shadowing into a shimmering acne pattern that shifts every frame as
    // the camera moves - it reads as the geometry "blinking". normalBias offsets
    // the shadow lookup along the surface normal instead of along the depth axis,
    // which removes the artefact without detaching contact shadows.
    dir.shadow.bias = -0.0002;
    dir.shadow.normalBias = 0.04;
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
      spot.shadow.bias = -0.0002;
      spot.shadow.normalBias = 0.04;
    }
    this.scene.add(spot);
    this.scene.add(spot.target);
    this.spots.push({ light: spot, baseIntensity: intensity });
    return spot;
  }

  /**
   * Adopt a light built elsewhere (the corridor fixtures in Laboratory) so it
   * obeys the same room state as the main rig.
   *
   * The corridor lights used to be created and then never referenced again by
   * `update()`, so they stayed at a fixed brightness for the whole game: the
   * room visibly powered up behind you while the way out remained dead dark.
   * They also stayed bright after the machine woke up, which inverted the
   * intended mood - the corridor should be the darkest place in the game.
   */
  registerAuxLight(light, baseIntensity, { dormantScale = 0.35, activeScale = 1 } = {}) {
    this.aux.push({ light, baseIntensity, dormantScale, activeScale });
  }

  /** Switch the room to the dim, abandoned look. */
  setDormant() {
    this._targetActive = 0;
    this._targetLevel = 0.35;
  }

  /**
   * Turn the failing exit tube's stutter on or off.
   *
   * Off by default because the lamp sits directly above the exit door: the dip
   * is bright enough to wash over the door and jambs, and on a flat surface that
   * reads as the geometry flickering. Enable it if you want the atmosphere and
   * do not mind the doorway breathing.
   */
  setFlickerEnabled(enabled) {
    this._flickerEnabled = !!enabled;
    if (!this._flickerEnabled) {
      this._flickerValue = 1;
      this._flickerTimer = 0;
    }
  }

  get flickerEnabled() {
    return this._flickerEnabled;
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
    //
    // It has to stay SUBTLE. The exit tube is the one nearest the corridor, so
    // the player is standing right beside it; the old version dropped to 0.05
    // on 40% of rolls for as little as 50 ms, which strobed the whole doorway
    // and looked like the geometry was blinking rather than the lamp failing.
    // Now the dip is bounded (never darker than 45%), rarer, and lasts long
    // enough to read as a deliberate stutter instead of frame noise.
    this._flickerTimer -= dt;
    if (!this._flickerEnabled) {
      this._flickerValue = 1;   // steady: no pulsing anywhere in the scene
    } else if (this._flickerTimer <= 0) {
      const roll = Math.random();
      if (roll < 0.18) this._flickerValue = 0.45 + Math.random() * 0.25; // stutter
      else if (roll < 0.24) this._flickerValue = 0.35; // deep dip, still visible
      else this._flickerValue = 1; // steady
      this._flickerTimer = 0.25 + Math.random() * (this._active > 0.5 ? 4.0 : 1.5);
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

    // Adopted lights (corridor fixtures). They lerp between their own dormant
    // and active levels rather than the room's, so the corridor can stay the
    // darkest area in the game even once the lab is fully powered.
    for (const a of this.aux) {
      const k = a.dormantScale + (a.activeScale - a.dormantScale) * this._active;
      a.light.intensity = a.baseIntensity * k;
    }
  }
}
