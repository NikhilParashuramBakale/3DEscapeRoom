import * as THREE from 'three';
import { createMaterials, makeCanvasTexture, makeLabelTexture } from './Materials.js';
import { Lighting } from './Lighting.js';
import { Props } from './Props.js';
import { Door, DOOR_FRAME_T, DOOR_OPENING_H } from '../objects/Door.js';
import { Keypad } from '../objects/Keypad.js';
import { Drawer } from '../objects/Drawer.js';
import { evaluateKeypadCode } from '../puzzles/CodeSheet.js';
import { GearPuzzle } from '../puzzles/GearPuzzle.js';
import { Machine } from './Machine.js';
import { CircuitPuzzle } from '../puzzles/CircuitPuzzle.js';
import { CircuitPanel } from './CircuitPanel.js';
import { ValvePuzzle } from '../puzzles/ValvePuzzle.js';
import { ValveRig } from './ValveRig.js';
import { FinalMachinePuzzle } from '../puzzles/FinalMachinePuzzle.js';
import { FinalMachine } from './FinalMachine.js';
import { TerminalWorkstation } from './TerminalWorkstation.js';

/**
 * Laboratory - builds the whole environment shell and exposes:
 *  - `colliders`  : AABBs the player must not walk through
 *  - `bounds`     : inner room limits
 *  - `door`       : the final exit door
 *  - `update(dt)` : per-frame animation for the door
 *
 * Room layout (interior 16 x 12, height 3.4):
 *   - North wall (z = -6) : EXIT door, lockers
 *   - West  wall (x = -8) : desk + chair, shelf
 *   - East  wall (x =  8) : kept clear for the machine (Phase 9)
 *   - South wall (z =  6) : player spawn
 */
export const ROOM = {
  width: 16,
  depth: 12,
  height: 3.4,
  wallThickness: 0.3,
};

export class Laboratory {
  constructor(scene) {
    this.scene = scene;
    this.materials = createMaterials();
    this.lighting = new Lighting(scene);
    this.props = new Props(this.materials);
    this.colliders = [];
    this.group = new THREE.Group();
    this.group.name = 'Laboratory';
    scene.add(this.group);

    this.bounds = {
      minX: -ROOM.width / 2 + 0.6,
      maxX: ROOM.width / 2 - 0.6,
      minZ: -ROOM.depth / 2 + 0.6,
      maxZ: ROOM.depth / 2 - 0.6,
    };

    this._buildShell();
    this._buildFurniture();
    this._buildExit();

    // Exit sign brightness target (damped in update()). The final machine's
    // activation boosts it as part of the escape payoff - see setExitSignBoost.
    this._exitSignTarget = 1.2;

    // Lighting states are configured inside Lighting; just start dim.
    this.lighting.setDormant();

    // Terminal proxy (interaction target) - set by _buildRoom2.
  }

  // ------------------------------------------------------------------
  // Room shell
  // ------------------------------------------------------------------
  _buildShell() {
    const m = this.materials;
    const { width: W, depth: D, height: H, wallThickness: T } = ROOM;

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), m.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    this.group.add(ceiling);

    // The north wall must be SOLID BOXES, not planes.
    //
    // A PlaneGeometry is single sided. These three panels face inward (+z), so
    // from the corridor (z < -6) the camera saw their back faces, which WebGL
    // culls - the whole wall vanished beside the doorway and the room appeared
    // open from outside. Boxes give the wall real thickness (T) and a valid
    // exterior face on both sides.
    const half = W / 2;
    const doorW = 1.72;
    const wallZ = -D / 2 - T / 2;   // inner face stays flush at z = -D / 2

    // Side wall panels must STOP at the outer edge of the jambs, not run under
    // them.
    //
    // Previously these spanned x 0.86..8.0 while the jambs spanned 0.86..1.16, so
    // each jamb was embedded INSIDE its panel with front and back faces exactly
    // coplanar at z = -6.3 and z = -6.0. Identical depth values meant the GPU
    // could not decide which surface owned the pixel, producing fine vertical
    // stripes that crawled and flickered as the camera moved. Trimming the panels
    // to begin at doorW/2 + T makes the jambs and panels adjacent instead of
    // overlapping - same silhouette, no coincident faces, no z-fighting.
    const jambOuter = doorW / 2 + T;
    const panelW = half - jambOuter;

    const northLeft = new THREE.Mesh(new THREE.BoxGeometry(panelW, H, T), m.wall);
    northLeft.position.set(-half + panelW / 2, H / 2, wallZ);
    this._alignWallUV(northLeft.geometry, northLeft.position, W, H, T);
    this._wall(northLeft);

    const northRight = northLeft.clone();
    northRight.position.x = half - panelW / 2;
    northRight.geometry = northLeft.geometry.clone();
    this._alignWallUV(northRight.geometry, northRight.position, W, H, T);
    this._wall(northRight);

    // Lintel above the door. The head height comes from the shared doorway
    // constants so the opening and the door frame head can never disagree -
    // when they did, a slot of daylight above the door read as a dark line
    // across the wall just under the EXIT sign.
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW, H - DOOR_OPENING_H, T), m.wall);
    lintel.position.set(0, DOOR_OPENING_H + (H - DOOR_OPENING_H) / 2, wallZ);
    this._alignWallUV(lintel.geometry, lintel.position, W, H, T);
    this._wall(lintel);

    // Door jambs: solid reveals framing the opening on the corridor side, so the
    // doorway reads as a hole in a thick wall instead of a slot in paper.
    //
    // They run the FULL wall height. Stopping them at the 2.72 head height
    // left the cells x 0.86..1.16, y 2.72..H empty: the lintel only spans the
    // doorway (|x| <= 0.86) and the side panels start at x = 1.16, so a
    // rectangular hole was left in each top corner beside the door. Full height
    // fills that corner and changes nothing else - the outer silhouette and
    // the clear opening are identical.
    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(T, H, T), m.wall);
      jamb.position.set(side * (doorW / 2 + T / 2), H / 2, wallZ);
      this._alignWallUV(jamb.geometry, jamb.position, W, H, T);
      this._wall(jamb);
    }

    const south = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.2), m.wall);
    south.position.set(0, H / 2, D / 2);
    this._wall(south);

    const west = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, D), m.wall);
    west.position.set(-half, H / 2, 0);
    this._wall(west);

    const east = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, D), m.wall);
    east.position.set(half, H / 2, 0);
    this._wall(east);

    // Skirting board strips (adds depth to the empty room)
    const skirtMat = m.darkMetal;
    const strips = [
      [W, 0.02, 0.1, 0, 0.05, -D / 2 + 0.05],
      [W, 0.02, 0.1, 0, 0.05, D / 2 - 0.05],
      [0.1, 0.02, D, -W / 2 + 0.05, 0.05, 0],
      [0.1, 0.02, D, W / 2 - 0.05, 0.05, 0],
    ];
    for (const [sx, sy, sz, px, py, pz] of strips) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), skirtMat);
      strip.position.set(px, py, pz);
      this.group.add(strip);
    }

    void T;
  }

  _alignWallUV(geometry, position, W, H, T) {
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const norm = geometry.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(norm.getX(i));
      const nz = Math.abs(norm.getZ(i));

      const wx = position.x + pos.getX(i);
      const wy = position.y + pos.getY(i);
      const wz = position.z + pos.getZ(i);

      if (nz > 0.5) {
        // Front or back face.
        uv.setXY(i, (wx + W / 2) / W, wy / H);
      } else if (nx > 0.5) {
        // Side face.
        uv.setXY(i, wz / W, wy / H);
      } else {
        // Top/bottom face.
        uv.setXY(i, (wx + W / 2) / W, wz / H);
      }
    }
    uv.needsUpdate = true;
  }

  _wall(mesh) {
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _buildFurniture() {
    const p = this.props;
    const g = this.group;
    const c = this.colliders;

    // Desk against the west wall; holds the drawer (Phase 7).
    this.desk = p.add(g, p.buildDesk(), c, { x: -5.5, z: 0 });

    // The programming note lies flat on the desk top, just right of the
    // pedestal. The desk top's upper surface is y = 0.96 exactly, so the group
    // is lifted to 0.968: the `under` sheet then sits at 0.972 and the paper at
    // 0.983, both clearly above the desk. Sitting at exactly 0.96 makes the
    // sheet coplanar with the desk and it z-fights into visibility.
    // It is added separately so the desk's own highlight does not tint it.
    this.codeSheet = p.add(g, p.buildCodeSheet(), c, {
      x: -5.5 + 0.45,
      y: 0.968,
      z: 0.05,
      rotY: -0.22,
      block: false,
    });

    // Phase 7: the drawer gains behaviour, the keypad gains its solution, and
    // the key inside the drawer becomes a pickup target.
    this.drawer = new Drawer(this.desk.userData.drawer, { openDistance: 0.55 });
    this.drawerKey = this.desk.userData.drawerKey;

    // The answer is derived from the note, so editing the note changes the code.
    this.keypadSolution = evaluateKeypadCode();
    this.keypad = new Keypad({
      bodyMaterial: this.materials.darkMetal,
      keyMaterial: this.materials.metal,
      solution: this.keypadSolution,
    });
    // Mounted on the pedestal front, to the right of the drawer front.
    this.keypad.group.position.set(-5.5 - 1.1 + 0.52, 0.62, 0.55);
    this.group.add(this.keypad.group);

    // Phase 8: the power machine on the east wall. The gear puzzle needs the
    // key seated in its keyhole (machineKeyInserted), so the machine only
    // accepts input once the player has used the key on the cabinet.
    this.gearPuzzle = new GearPuzzle({ teeth: [12, 18, 12], targets: [0, 6, 0] });
    this.machine = new Machine({ materials: this.materials, puzzle: this.gearPuzzle });
    // Back (local z -0.25) sits flush on the east wall's inner face (x 7.85);
    // y 0.75 so the 1.5 m cabinet STANDS on the floor instead of being
    // half-sunk into it. With rotY -90° the +z face (gear train, keyhole,
    // vents) looks west into the room.
    this.machine.group.position.set(7.6, 0.75, -1.0);
    this.machine.group.rotation.y = -Math.PI / 2; // face into the room
    this.group.add(this.machine.group);

    // The machine is a 1.5 m tall cabinet, so the player must not walk through
    // it. It was added straight to the group above and never registered as a
    // collider, which left the only large solid object in the room completely
    // permeable - the player could stand inside the gears.
    //
    // The Box3 is measured from the ROTATED group, so the footprint already
    // accounts for the -90 degree turn: the 1.9 m long axis runs along Z
    // (down the wall), the 0.5 m depth along X, and the key (held just proud
    // of its keyhole) pulls the west edge out to cover its insertion arc.
    this.machineBox = new THREE.Box3().setFromObject(this.machine.group);
    c.push({
      minX: this.machineBox.min.x,
      maxX: this.machineBox.max.x,
      minZ: this.machineBox.min.z,
      maxZ: this.machineBox.max.z,
      top: this.machineBox.max.y,
    });

    // Phase 16: electrical circuit panel on the south wall, right of spawn.
    // Faces north into the room so the player walks up and reads it.
    this.circuitPuzzle = new CircuitPuzzle();
    this.circuitPanel = new CircuitPanel({ materials: this.materials, puzzle: this.circuitPuzzle });
    p.add(g, this.circuitPanel.group, c, { x: 3.5, y: 1.7, z: 5.72, rotY: Math.PI });

    // No wiring memo any more (user revision): the panel's own "n of 5
    // channels aligned" toast + proximity bar are what make it deducible.

    // Phase 17: pressure/valve rig on the east wall, south of the gear
    // machine (which spans z -1.95..-0.05). Inactive until the circuit solves.
    this.valvePuzzle = new ValvePuzzle();
    this.valveRig = new ValveRig({ materials: this.materials, puzzle: this.valvePuzzle });
    // East wall inner face is x = 7.85; the plate is 0.12 deep and centred at
    // local z = 0, so x = 7.79 puts its back exactly on the wall.
    p.add(g, this.valveRig.group, c, { x: 7.79, y: 1.3, z: 3.4, rotY: -Math.PI / 2 });

    // No pressure placard either: the rig is steered by the
    // "n of 3 valves aligned" toast after each quarter-turn.

    // Phase 18: the final machine on the south wall, west of the circuit
    // panel (which spans roughly x 2.4..4.6). Inert until Game powers it.
    this.finalPuzzle = new FinalMachinePuzzle();
    this.finalMachine = new FinalMachine({ materials: this.materials, puzzle: this.finalPuzzle });
    p.add(g, this.finalMachine.group, c, { x: -2.2, z: 5.45, rotY: Math.PI });

    // The painting by the final machine (user revision): it must read as
    // ART, not as a hint board. It is an abstract canvas - colour fields,
    // brush streaks and three ring motifs at scattered heights - whose only
    // puzzle content is the angle of one dark stroke per ring. No title, no
    // dial letters, no numbers. It hangs on the south wall just west of the
    // final machine (machine spans roughly x -3.5..-0.9; the desk is at
    // x -5.5 mid-room, so x -4.4 is clear).
    this.orientationChart = this._buildOrientationChart();
    p.add(g, this.orientationChart, c, { x: -4.4, y: 1.7, z: 5.97, rotY: Math.PI, block: false });

    // Station plates: one reading per earlier puzzle, together they form
    // the final machine's dial solution (see FinalMachinePuzzle.js).
    this.stationPlates = [
      { key: 'REDUCTION', degrees: 90, x: 7.72, y: 2.35, z: -1.0, rotY: -Math.PI / 2 },
      { key: 'OUTPUT', degrees: 180, x: 5.1, y: 1.65, z: 5.8, rotY: Math.PI },
      { key: 'FLOW', degrees: 270, x: 7.72, y: 2.5, z: 3.4, rotY: -Math.PI / 2 },
    ].map((plate) => ({
      ...plate,
      group: this._buildStationPlate(plate.key, plate.degrees),
    }));
    for (const plate of this.stationPlates) {
      p.add(g, plate.group, c, { x: plate.x, y: plate.y, z: plate.z, rotY: plate.rotY, block: false });
    }

    p.add(g, p.buildChair(), c, { x: -4.1, z: 0.3, rotY: -Math.PI / 2 });

    p.add(g, p.buildCrates(), c, { block: true });
    p.add(g, p.buildLockers(), c, { block: true });
    p.add(g, p.buildShelf(), c, { block: false });
    p.add(g, p.buildPipes(), c, { block: false });
  }

  _buildExit() {
    // Exit door on the north wall, hinge on the left.
    //
    // The leaf height is derived from the opening so that leaf + frame head
    // lands EXACTLY on DOOR_OPENING_H. Declaring `height: 2.6` here while the
    // opening is 2.72 and the frame is 0.07 thick left a 0.05 m gap above the
    // door - a slot of open air that showed the unlit corridor beyond as a dark
    // line on the wall.
    this.door = new Door({
      material: this.materials.doorPanel,
      metalMaterial: this.materials.darkMetal,
      width: 1.6,
      height: DOOR_OPENING_H - DOOR_FRAME_T,
      openAngle: -Math.PI * 0.55,
    });
    this.door.group.position.set(-0.8, 0, -ROOM.depth / 2 + 0.1);
    this.group.add(this.door.group);

    const sign = this.props.buildExitSign(0, 2.95, -ROOM.depth / 2 + 0.16);
    this.group.add(sign);
    this.exitSign = sign;

    this._buildCorridor();
  }

  /**
   * The corridor beyond the exit door (Phase 9).
   *
   * Without this there is nowhere to escape TO. The room bounds clamp the
   * player to z >= -5.4, so the old escape check at z < -5.6 could never fire
   * and the game was unwinnable by construction.
   *
   * Built outside the north wall, so it never interferes with the lab interior.
   */
  _buildCorridor() {
    const m = this.materials;
    const width = 3.2;   // comfortably wider than the 1.6 doorway
    const length = 7.0;  // enough room to walk clear of the threshold
    const z0 = -ROOM.depth / 2 - ROOM.wallThickness;   // OUTER face of north wall
    const zc = z0 - length / 2;   // corridor centre
    const h = 2.6;

    const g = new THREE.Group();
    g.name = 'Corridor';
    this.group.add(g);
    this.corridor = g;

    // Floor, continuing out from under the doorway.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, length), m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zc);
    floor.receiveShadow = true;
    g.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, length), m.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, h, zc);
    g.add(ceiling);

    // Side walls, facing inward. Use boxes so they are solid from both sides.
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, length), m.wall);
      wall.position.set(side * (width / 2), h / 2, zc);
      wall.receiveShadow = true;
      g.add(wall);
    }

    // Archway portal leading into Room 2 (the code chamber).
    // Solid jamb posts (left x: -1.6..-0.8, right x: 0.8..1.6) and lintel above (y: 2.2..2.6)
    // frame a clean 1.6m wide doorway opening into the chamber.
    const postW = 0.8;
    const archH = 2.2;
    const lintelH = h - archH;
    const archZ = z0 - length;

    const archLeft = new THREE.Mesh(new THREE.BoxGeometry(postW, h, 0.16), m.wall);
    archLeft.position.set(-width / 2 + postW / 2, h / 2, archZ);
    archLeft.receiveShadow = true;
    g.add(archLeft);

    const archRight = new THREE.Mesh(new THREE.BoxGeometry(postW, h, 0.16), m.wall);
    archRight.position.set(width / 2 - postW / 2, h / 2, archZ);
    archRight.receiveShadow = true;
    g.add(archRight);

    const archLintel = new THREE.Mesh(new THREE.BoxGeometry(1.6, lintelH, 0.16), m.wall);
    archLintel.position.set(0, archH + lintelH / 2, archZ);
    archLintel.receiveShadow = true;
    g.add(archLintel);

    // Real ceiling lamps with actual PointLights. An emissive box alone only
    // LOOKS bright - it casts no light, which left the corridor ceiling
    // rendering pure black. Each fixture needs both.
    this.corridorLights = [];
    for (const z of [zc - 1.8, zc + 1.8]) {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.5), m.lampOn);
      fixture.position.set(0, h - 0.06, z);
      g.add(fixture);

      const light = new THREE.PointLight(0xbfe0ff, 14, 9, 1.6);
      light.position.set(0, h - 0.2, z);
      g.add(light);
      this.corridorLights.push(light);

      // Hand it to the lighting rig so it dims with the abandoned lab and
      // brightens when the power comes back. Left unmanaged it stayed at a
      // fixed 14 for the whole run: the room lit up behind you while the way
      // out stayed dead, which read as a bug rather than a choice.
      this.lighting.registerAuxLight(light, 14, { dormantScale: 0.3, activeScale: 1 });
    }

    // Only the corridor's own walls block movement.
    //
    // maxZ must overlap the room's bounds by a clear margin so the union has
    // NO gap. Room minZ is -5.4, so maxZ has to exceed -5.4; +1.2 gives a 1.2
    // overlap. A flush edge (maxZ == z0 == -6.0) left a 0.6-wide band that was
    // in neither zone, and because the escape trigger needs z STRICTLY below
    // -5.6, the player could reach exactly -5.6 and then be stopped for good.
    //
    // minX/maxX are clamped to the 1.72 doorway minus the jamb thickness. The
    // corridor is 3.2 wide, but the wall's jamb blocks occupy |x| 0.86..1.16;
    // a wider zone would let the player stand inside solid masonry.
    const half = width / 2;
    const clear = 0.8;
    this.corridorBounds = {
      minX: -clear,
      maxX: clear,
      minZ: z0 - length + 0.3,
      maxZ: z0 + 1.6,
    };

    // Room 2: The Proctor Chamber beyond the corridor doorway.
    this._buildRoom2();
  }

  /** Build Room 2: The Proctor Chamber. */
  _buildRoom2() {
    const m = this.materials;
    const g = new THREE.Group();
    g.name = 'Room2_ProctorChamber';
    this.group.add(g);
    this.room2 = g;

    const z0 = -ROOM.depth / 2 - ROOM.wallThickness; // outer face of north wall (-6.3)
    const archZ = z0 - 7.0; // -13.3 (entrance archway from corridor)
    const W2 = 14.0;        // chamber width (was 8 — now spacious)
    const L2 = 14.0;        // chamber depth (was 8 — now spacious)
    const H2 = 3.8;         // examination chamber ceiling height (was 3.2)
    const zCenter = archZ - L2 / 2; // -20.3 (chamber center)
    const farZ = archZ - L2;        // -27.3 (far north wall with exit door)

    // Floor (14x14m) with a tiled industrial pattern and a central emblem.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W2, L2), m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zCenter);
    floor.receiveShadow = true;
    g.add(floor);

    // Secondary grid overlay for a more designed floor.
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(W2 - 0.6, L2 - 0.6), m.darkMetal);
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(0, 0.005, zCenter);
    g.add(grid);

    // Floor tile lines (white painted markings).
    for (let i = -6; i <= 6; i++) {
      const lineH = new THREE.Mesh(new THREE.PlaneGeometry(W2 - 1.0, 0.04), new THREE.MeshBasicMaterial({ color: 0x7ff0d8, transparent: true, opacity: 0.35 }));
      lineH.rotation.x = -Math.PI / 2;
      lineH.position.set(0, 0.012, zCenter + i * 1.1);
      g.add(lineH);
      const lineV = new THREE.Mesh(new THREE.PlaneGeometry(0.04, L2 - 1.0), new THREE.MeshBasicMaterial({ color: 0x7ff0d8, transparent: true, opacity: 0.35 }));
      lineV.rotation.x = -Math.PI / 2;
      lineV.position.set(i * 1.1, 0.012, zCenter);
      g.add(lineV);
    }

    // Floor border strip along all four edges.
    const floorBorder = new THREE.Mesh(
      new THREE.PlaneGeometry(W2 - 0.4, L2 - 0.4),
      m.darkMetal
    );
    floorBorder.rotation.x = -Math.PI / 2;
    floorBorder.position.set(0, 0.01, zCenter);
    floorBorder.receiveShadow = true;
    g.add(floorBorder);

    // Ceiling (14x14m).
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W2, L2), m.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H2, zCenter);
    g.add(ceiling);

    // Side walls: West (x = -7.0) and East (x = 7.0). Use boxes so they are
    // visible from both sides (no see-through from the corridor).
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, H2, L2), m.wall);
    westWall.position.set(-W2 / 2, H2 / 2, zCenter);
    westWall.receiveShadow = true;
    g.add(westWall);

    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, H2, L2), m.wall);
    eastWall.position.set(W2 / 2, H2 / 2, zCenter);
    eastWall.receiveShadow = true;
    g.add(eastWall);

    // South wall (z = archZ = -13.3) connecting to corridor archway.
    // Framed left and right partitions with an open 2.0m wide doorway opening.
    const archW = 2.0;
    const southLeft = new THREE.Mesh(new THREE.BoxGeometry(W2 / 2 - archW / 2, H2, 0.2), m.wall);
    southLeft.position.set(-W2 / 4 - archW / 4, H2 / 2, archZ);
    southLeft.receiveShadow = true;
    g.add(southLeft);

    const southRight = new THREE.Mesh(new THREE.BoxGeometry(W2 / 2 - archW / 2, H2, 0.2), m.wall);
    southRight.position.set(W2 / 4 + archW / 4, H2 / 2, archZ);
    southRight.receiveShadow = true;
    g.add(southRight);

    const southLintel = new THREE.Mesh(new THREE.BoxGeometry(archW, H2 - 2.4, 0.2), m.wall);
    southLintel.position.set(0, 2.4 + (H2 - 2.4) / 2, archZ);
    southLintel.receiveShadow = true;
    g.add(southLintel);

    // Entrance door to Room 2 (from corridor). Locked until Room 1 is cleared.
    this.room2EntranceDoor = new Door({
      material: m.doorPanel,
      metalMaterial: m.darkMetal,
      width: 1.8,
      height: 2.6,
    });
    this.room2EntranceDoor.group.position.set(-0.9, 0, archZ + 0.08);
    g.add(this.room2EntranceDoor.group);
    this.room2EntranceDoor.unlock(); // unlock so it can be opened
    this.room2EntranceDoor.open();   // start open so player can walk through

    // Archway stencil sign above entrance.
    const archSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.35),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('PROCTOR CHAMBER', '#142028', '#7ff0d8'),
        transparent: true,
        opacity: 0.9,
      })
    );
    archSign.position.set(0, 2.6, archZ - 0.12);
    g.add(archSign);
    archSign.position.set(0, 2.6, archZ - 0.12);
    g.add(archSign);

    // North wall (z = farZ = -27.3) opposite entrance, with exit door.
    const northLeft = new THREE.Mesh(new THREE.BoxGeometry(W2 / 2 - archW / 2, H2, 0.2), m.wall);
    northLeft.position.set(-W2 / 4 - archW / 4, H2 / 2, farZ);
    northLeft.receiveShadow = true;
    g.add(northLeft);

    const northRight = new THREE.Mesh(new THREE.BoxGeometry(W2 / 2 - archW / 2, H2, 0.2), m.wall);
    northRight.position.set(W2 / 4 + archW / 4, H2 / 2, farZ);
    northRight.receiveShadow = true;
    g.add(northRight);

    const northLintel = new THREE.Mesh(new THREE.BoxGeometry(archW, H2 - 2.8, 0.2), m.wall);
    northLintel.position.set(0, 2.8 + (H2 - 2.8) / 2, farZ);
    northLintel.receiveShadow = true;
    g.add(northLintel);

    // Room 2 exit door (unlocked after Terminal 01 is solved).
    this.room2Door = new Door({
      material: m.doorPanel,
      metalMaterial: m.darkMetal,
      width: 1.8,
      height: 2.8,
    });
    this.room2Door.group.position.set(-0.9, 0, farZ + 0.08);
    g.add(this.room2Door.group);
    this.room2ExitDoor = this.room2Door.leaf;

    // Room 2 exit door collider: blocks the threshold only while the door is shut.
    // Managed dynamically in update() so an open door lets the player through.
    this.room2DoorCollider = {
      minX: -1.9,
      maxX: 0.9,
      minZ: farZ - 0.12,
      maxZ: farZ + 0.2,
      top: 2.8,
    };
    this.colliders.push(this.room2DoorCollider);

    // Exit sign above the door — red when locked, green when unlocked.
    this.exitSignMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshStandardMaterial({
        map: makeLabelTexture('CHAMBER EXIT', '#220808', '#ff3b30'),
        emissive: 0xff2200,
        emissiveIntensity: 0.8,
      })
    );
    this.exitSignMesh.position.set(0, 3.0, farZ + 0.12);
    g.add(this.exitSignMesh);

    // ------------------------------------------------------------------
    // Central Area for Future Stations (Dais & Dormant Proctor Core)
    // ------------------------------------------------------------------
    const centralDais = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.45, 0.08, 24),
      m.darkMetal
    );
    centralDais.position.set(0, 0.04, zCenter);
    centralDais.receiveShadow = true;
    g.add(centralDais);

    // Core base plinth.
    const coreBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.55, 0.4, 16),
      m.metal
    );
    coreBase.position.set(0, 0.24, zCenter);
    g.add(coreBase);

    // Core containment glass tube.
    const coreTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 1.6, 16),
      m.glass
    );
    coreTube.position.set(0, 1.2, zCenter);
    g.add(coreTube);

    // Core top cap.
    const coreCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.2, 16),
      m.darkMetal
    );
    coreCap.position.set(0, 2.1, zCenter);
    g.add(coreCap);

    // Dormant Proctor Core crystal inside the tube.
    this.coreCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2, 0),
      new THREE.MeshStandardMaterial({
        color: 0x224455,
        emissive: 0x112233,
        emissiveIntensity: 0.5,
        roughness: 0.2,
      })
    );
    this.coreCrystal.position.set(0, 1.2, zCenter);
    g.add(this.coreCrystal);

    // Core collision box so the player cannot walk through the center core.
    this.colliders.push({
      minX: -1.2,
      maxX: 1.2,
      minZ: zCenter - 1.2,
      maxZ: zCenter + 1.2,
      top: 2.2,
    });

    // Reserved station floor pads for future phases.
    this._buildStationPad(g, 4.0, zCenter, 'STATION 02: BINARY REGISTER');
    this._buildStationPad(g, -4.0, zCenter, 'STATION 03: PHYSICS LIFT');
    this._buildStationPad(g, 3.5, -25.5, 'STATION 04: TRANSFORMATION BENCH');

    // ------------------------------------------------------------------
    // Station 01 — C++ Code Terminal (near entrance, visible upon arrival)
    // ------------------------------------------------------------------
    const termX = -4.0;
    const termZ = -17.0;

    this.terminalWorkstation = new TerminalWorkstation(this.materials);
    this.terminalWorkstation.group.position.set(termX, 0, termZ);
    this.terminalWorkstation.group.rotation.y = 0.2; // angled slightly towards the entrance
    g.add(this.terminalWorkstation.group);
    this.terminalGroup = this.terminalWorkstation.group;

    // Invisible interaction proxy for the terminal.
    this.terminalProxy = this.terminalWorkstation.proxy;
    this.terminalProxy.position.set(termX + 0.1, 0.85, termZ + 0.3);
    g.add(this.terminalProxy);

    // Terminal workstation collider.
    this.colliders.push({
      minX: termX - 1.2,
      maxX: termX + 1.2,
      minZ: termZ - 0.8,
      maxZ: termZ + 0.8,
      top: 1.5,
    });

    // Certificate stand / tray on the workstation for compatibility.
    this.certificateGroup = this._buildCertificateStand();
    this.certificateGroup.position.set(termX + 1.2, 0, termZ);
    g.add(this.certificateGroup);

    this.certificateProxy = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    this.certificateProxy.name = 'CertificateProxy';
    this.certificateProxy.position.set(termX + 1.2, 0.8, termZ);
    g.add(this.certificateProxy);

    // ------------------------------------------------------------------
    // Room 2 Lighting (Emergency and Restored Examination Power)
    // ------------------------------------------------------------------
    this.room2Lights = [];
    this._room2Active = false;

    // Hanging bulb lights for better illumination.
    const bulbPositions = [
      [-4, H2 - 0.3, zCenter - 4],
      [4, H2 - 0.3, zCenter - 4],
      [-4, H2 - 0.3, zCenter + 4],
      [4, H2 - 0.3, zCenter + 4],
      [0, H2 - 0.3, zCenter],
    ];
    for (const [bx, by, bz] of bulbPositions) {
      // Bulb mesh
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffcc66, emissiveIntensity: 0.8, roughness: 0.3 })
      );
      bulb.position.set(bx, by, bz);
      g.add(bulb);
      // Wire/cord
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.6, 6),
        m.darkMetal
      );
      cord.position.set(bx, by + 0.35, bz);
      g.add(cord);
      // Point light
      const light = new THREE.PointLight(0xffeeaa, 8, 12, 1.5);
      light.position.set(bx, by, bz);
      g.add(light);
      this.lighting.registerAuxLight(light, 8, { dormantScale: 0.4, activeScale: 1.1 });
      this.room2Lights.push(light);
    }

    // Central emergency amber beacon.
    this.room2Beacon = new THREE.PointLight(0xffaa44, 12, 20, 1.4);
    this.room2Beacon.position.set(0, H2 - 0.3, zCenter);
    g.add(this.room2Beacon);
    this.lighting.registerAuxLight(this.room2Beacon, 12, { dormantScale: 0.5, activeScale: 1.2 });
    this.room2Lights.push(this.room2Beacon);

    // Workstation task light above Terminal 01.
    const termLight = new THREE.PointLight(0x7ff0d8, 12, 10, 1.6);
    termLight.position.set(termX, H2 - 0.4, termZ);
    g.add(termLight);
    this.lighting.registerAuxLight(termLight, 12, { dormantScale: 0.6, activeScale: 1.4 });
    this.room2Lights.push(termLight);

    // Chamber ambient light (far north, near exit).
    const chamberLight = new THREE.PointLight(0xbfe0ff, 12, 20, 1.6);
    chamberLight.position.set(0, H2 - 0.4, farZ + 2.0);
    g.add(chamberLight);
    this.lighting.registerAuxLight(chamberLight, 12, { dormantScale: 0.4, activeScale: 1.2 });
    this.room2Lights.push(chamberLight);

    // ------------------------------------------------------------------
    // Room 2 Walkable Bounds
    // ------------------------------------------------------------------
    // Overlaps corridor bounds (which end at z = -13.0) so the player can
    // walk straight through the archway into the chamber.
    // Extends past the north exit door (farZ) so the player can walk
    // through the doorway and past the threshold to trigger escape.
    this.room2Bounds = {
      minX: -6.0,
      maxX: 6.0,
      minZ: farZ - 1.0,
      maxZ: -12.8,
    };

    // Exit corridor beyond the chamber door (leads to freedom).
    this._buildRoom2ExitCorridor(farZ);
  }

  /** Build a corridor beyond Room 2's exit door. */
  _buildRoom2ExitCorridor(farZ) {
    const m = this.materials;
    const g = new THREE.Group();
    g.name = 'Room2ExitCorridor';
    this.group.add(g);
    this.room2ExitCorridor = g;

    const width = 3.6;
    const length = 12.0;
    const h = 3.0;
    const z0 = farZ;            // outer face of Room 2 north wall
    const zc = z0 - length / 2; // corridor centre

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, length), m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zc);
    floor.receiveShadow = true;
    g.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, length), m.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, h, zc);
    g.add(ceiling);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, h), m.wall);
      wall.position.set(side * (width / 2), h / 2, zc);
      wall.rotation.y = -side * Math.PI / 2;
      wall.receiveShadow = true;
      g.add(wall);
    }

    // Floor guide strip down the centre.
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.6, length), m.darkMetal);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.015, zc);
    g.add(strip);

    // Overhead lamps.
    this.room2ExitLights = [];
    for (const z of [zc - 3.0, zc, zc + 3.0]) {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.5), m.lampOn);
      fixture.position.set(0, h - 0.06, z);
      g.add(fixture);
      const light = new THREE.PointLight(0xbfe0ff, 16, 10, 1.6);
      light.position.set(0, h - 0.2, z);
      g.add(light);
      this.room2ExitLights.push(light);
      this.lighting.registerAuxLight(light, 16, { dormantScale: 0.4, activeScale: 1.2 });
    }

    // Bounds so the player can walk through.
    this.room2ExitCorridorBounds = {
      minX: -1.4,
      maxX: 1.4,
      minZ: z0 - length + 0.3,
      maxZ: z0 + 1.0,
    };

    // Extend room2Bounds to cover the corridor for movement.
    this.room2Bounds.minZ = z0 - length + 0.3;
  }

  /** Build reserved station floor pad for upcoming phases. */
  _buildStationPad(g, x, z, label) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.04, 1.4),
      this.materials.darkMetal
    );
    pad.position.set(x, 0.02, z);
    pad.receiveShadow = true;
    g.add(pad);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(1.64, 0.02, 1.44),
      this.materials.metal
    );
    border.position.set(x, 0.01, z);
    g.add(border);

    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.22),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture(label.split(':')[0], '#111820', '#4d6a75'),
        transparent: true,
        opacity: 0.85,
      })
    );
    tag.rotation.x = -Math.PI / 2;
    tag.position.set(x, 0.045, z + 0.45);
    g.add(tag);
  }

  get terminalScreenMat() {
    return this.terminalWorkstation?.screenMat;
  }

  get terminalLampMat() {
    return this.terminalWorkstation?.lampMat;
  }

  get terminalPowerMat() {
    return this.terminalWorkstation?.powerMat;
  }

  /** Activate Station 01 terminal visuals upon correct diagnostic solve. */
  activateTerminal() {
    this._terminalActive = true;
    if (this.terminalWorkstation) {
      this.terminalWorkstation.activate();
    }
    if (this.coreCrystal) {
      this.coreCrystal.material.color.setHex(0x00ff88);
      this.coreCrystal.material.emissive.setHex(0x00aa55);
      this.coreCrystal.material.emissiveIntensity = 1.0;
    }
    this.setRoom2LightingActive();
  }

  /** Gradually brighten Room 2 illumination to restored examination power. */
  setRoom2LightingActive() {
    this._room2Active = true;
  }

  /** Build a certificate stand (clearance certificate on a pedestal). */
  _buildCertificateStand() {
    const g = new THREE.Group();
    g.name = 'CertificateStand';

    // Pedestal.
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.04, 0.5),
      this.materials.darkMetal
    );
    base.position.y = 0.8;
    g.add(base);

    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.75, 0.06),
      this.materials.darkMetal
    );
    post.position.set(0, 0.425, 0);
    g.add(post);

    // Certificate (paper, slightly angled).
    const cert = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.45),
      new THREE.MeshBasicMaterial({ color: 0xf0e6d2 })
    );
    cert.position.set(0, 1.12, 0.256);
    cert.rotation.x = -0.25;
    g.add(cert);

    // Certificate user data so Game can find it.
    g.userData.certificate = cert;

    return g;
  }

  update(dt) {
    this.door.update(dt);
    if (this.room2Door) {
      this.room2Door.update(dt);
      // Door collider: blocks the threshold only while the door is shut.
      const idx = this.colliders.indexOf(this.room2DoorCollider);
      if (this.room2Door.isOpen && idx !== -1) {
        this.colliders.splice(idx, 1);
      } else if (!this.room2Door.isOpen && idx === -1) {
        this.colliders.push(this.room2DoorCollider);
      }
    }
    if (this.room2EntranceDoor) this.room2EntranceDoor.update(dt);
    this.drawer.update(dt);
    this.machine.update(dt);
    if (this.circuitPanel) this.circuitPanel.update(dt);
    if (this.valveRig) this.valveRig.update(dt);
    if (this.finalMachine) this.finalMachine.update(dt);
    // EXIT sign eases toward its target brightness (final machine boosts it).
    if (this.exitSign) {
      this.exitSign.material.emissiveIntensity = THREE.MathUtils.damp(
        this.exitSign.material.emissiveIntensity, this._exitSignTarget, 1.2, dt
      );
    }
    // Room 2 emergency beacon rotation/pulse
    if (this.room2Beacon) {
      this._beaconAngle = (this._beaconAngle || 0) + dt * 2.0;
      this.room2Beacon.intensity = 8 + Math.sin(this._beaconAngle * 2) * 3;
    }
    // Room 2 lighting smooth brightening on examination power restore
    if (this.room2Lights && this._room2Active) {
      for (const light of this.room2Lights) {
        light.intensity = THREE.MathUtils.damp(light.intensity, 16, 1.5, dt);
      }
    }
    this.lighting.update(dt);
  }

  /** Brighten the EXIT sign (called when the final machine comes online). */
  setExitSignBoost(intensity = 3.0) {
    this._exitSignTarget = intensity;
  }

  /**
   * Station reading plate (Phase 18).
   *
   * A small metal plate engraved with one value (e.g. "REDUCTION 90").
   * The three plates - placed beside the gear machine, the circuit panel and
   * the valve rig - are the only place the final machine's dial solution is
   * written down; the machine itself never shows it.
   */
  _buildStationPlate(key, degrees) {
    const g = new THREE.Group();
    g.name = `StationPlate-${key}`;

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.24, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xb8a46a, roughness: 0.55, metalness: 0.4 })
    );
    g.add(plate);

    // Engraved-look recess suggesting the stamped label + value lines.
    const ink = new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.95 });
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.008), ink);
    label.position.set(0, 0.05, 0.019);
    g.add(label);
    const value = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.008), ink);
    value.position.set(0, -0.05, 0.019);
    g.add(value);

    // Corner screws.
    for (const [x, y] of [[-0.21, 0.09], [0.21, 0.09], [-0.21, -0.09], [0.21, -0.09]]) {
      const screw = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), this.materials.metal);
      screw.position.set(x, y, 0.019);
      g.add(screw);
    }

    g.userData.reading = `${key} = ${degrees} deg`;
    return g;
  }

  /**
   * The abstract painting beside the final machine (user revision: it must
   * read as ART, not as a labelled diagram).
   *
   * Composition: aged linen ground, muted colour fields and brush streaks,
   * three ring motifs scattered at different heights and sizes - Kandinsky
   * rather than control panel. Each ring is crossed by ONE dark brush
   * stroke at its working angle (state * 90 deg clockwise from 12 o'clock,
   * the same convention the physical pointers use, since FinalMachine.eases
   * rotation.z to -(state * PI)/2 and the dial face is read head-on).
   *
   * No title, no dial letters, no numbers, no neat row - an observant
   * player notices the three strokes rhyme with the machine's dials; a
   * casual player sees only a painting. The stroke states are derived from
   * the LIVE puzzle, so the art can never drift from the real solution.
   */
  _buildOrientationChart() {
    const g = new THREE.Group();
    g.name = 'OrientationChart';

    // Dark frame + backing board.
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.86, 0.05), this.materials.darkMetal);
    g.add(frame);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    // Aged linen ground with muted colour fields - deliberately uneven, so
    // it reads as painted, not printed.
    ctx.fillStyle = '#cbb894';
    ctx.fillRect(0, 0, 512, 384);
    ctx.fillStyle = '#3d4a63';
    ctx.fillRect(0, 0, 300, 150);
    ctx.fillStyle = '#8a4a35';
    ctx.fillRect(60, 250, 392, 134);
    ctx.fillStyle = '#6f7a5c';
    ctx.fillRect(330, 60, 182, 190);

    // Brush streaks from a seeded generator: identical on every load, but
    // irregular enough to look hand-worked.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const palette = ['#3d4a63', '#8a4a35', '#6f7a5c', '#c2a86b', '#54606e', '#7c6a4a'];
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = palette[Math.floor(rnd() * palette.length)];
      ctx.fillRect(rnd() * 512 - 40, rnd() * 384, 24 + rnd() * 120, 3 + rnd() * 7);
    }

    // The three ring motifs: different sizes, colours and heights, arranged
    // as a composition rather than a row. Their stroke angles are the ONLY
    // puzzle content in the whole painting.
    this._chartStates = [...this.finalPuzzle.solution];
    const rings = [
      { cx: 150, cy: 148, r: 56, color: '#20222b' },
      { cx: 264, cy: 226, r: 68, color: '#7a2f26' },
      { cx: 392, cy: 132, r: 50, color: '#1f423c' },
    ];
    for (let i = 0; i < rings.length; i++) {
      const { cx, cy, r, color } = rings[i];

      // Ring.
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Faint quarter ticks, painted into the motif.
      ctx.lineWidth = 3;
      for (let t = 0; t < 4; t++) {
        const a = (t * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(a) * (r - 8), cy - Math.cos(a) * (r - 8));
        ctx.lineTo(cx + Math.sin(a) * (r + 8), cy - Math.cos(a) * (r + 8));
        ctx.stroke();
      }

      // ONE dark brush stroke at the working angle (0 = up, clockwise -
      // the same direction the physical pointer turns as seen head-on).
      const ang = (this._chartStates[i] * Math.PI) / 2;
      ctx.strokeStyle = '#171512';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(ang) * (r - 4), cy - Math.cos(ang) * (r - 4));
      ctx.stroke();

      // Painted hub dot.
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#171512';
      ctx.fill();
    }

    // Painter's signature squiggle + two hairline age cracks. No words
    // anywhere on the canvas - the piece must look like decor.
    ctx.strokeStyle = '#171512';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(430, 352);
    ctx.lineTo(444, 344);
    ctx.lineTo(452, 354);
    ctx.lineTo(462, 343);
    ctx.lineTo(472, 352);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 20);
    ctx.lineTo(96, 180);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(300, 380);
    ctx.lineTo(316, 220);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const painting = new THREE.Mesh(
      new THREE.PlaneGeometry(1.06, 0.76),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 })
    );
    painting.position.z = 0.028;
    g.add(painting);

    return g;
  }
}
