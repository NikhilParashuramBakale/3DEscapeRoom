import * as THREE from 'three';
import { createMaterials } from './Materials.js';
import { Lighting } from './Lighting.js';
import { Props } from './Props.js';
import { Door } from '../objects/Door.js';

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

    // Lighting states are configured inside Lighting; just start dim.
    this.lighting.setDormant();
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

    // Four walls (inward facing). North wall is split around the doorway.
    const half = W / 2;
    const doorW = 1.72;

    const northLeft = new THREE.Mesh(new THREE.PlaneGeometry(half - doorW / 2, H), m.wall);
    northLeft.position.set(-half + (half - doorW / 2) / 2, H / 2, -D / 2);
    this._wall(northLeft);

    const northRight = northLeft.clone();
    northRight.position.x = half - (half - doorW / 2) / 2;
    this._wall(northRight);

    // Lintel above the door
    const lintel = new THREE.Mesh(new THREE.PlaneGeometry(doorW, H - 2.72), m.wall);
    lintel.position.set(0, 2.72 + (H - 2.72) / 2, -D / 2);
    this._wall(lintel);

    const south = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m.wall);
    south.position.set(0, H / 2, D / 2);
    south.rotation.y = Math.PI;
    this._wall(south);

    const west = new THREE.Mesh(new THREE.PlaneGeometry(D, H), m.wall);
    west.position.set(-half, H / 2, 0);
    west.rotation.y = Math.PI / 2;
    this._wall(west);

    const east = new THREE.Mesh(new THREE.PlaneGeometry(D, H), m.wall);
    east.position.set(half, H / 2, 0);
    east.rotation.y = -Math.PI / 2;
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

    p.add(g, p.buildChair(), c, { x: -4.1, z: 0.3, rotY: -Math.PI / 2 });

    p.add(g, p.buildCrates(), c, { block: true });
    p.add(g, p.buildLockers(), c, { block: true });
    p.add(g, p.buildShelf(), c, { block: false });
    p.add(g, p.buildPipes(), c, { block: false });
  }

  _buildExit() {
    // Exit door on the north wall, hinge on the left.
    this.door = new Door({
      material: this.materials.doorPanel,
      metalMaterial: this.materials.darkMetal,
      width: 1.6,
      height: 2.6,
      openAngle: -Math.PI * 0.55,
    });
    this.door.group.position.set(-0.8, 0, -ROOM.depth / 2 + 0.1);
    this.group.add(this.door.group);

    const sign = this.props.buildExitSign(0, 2.95, -ROOM.depth / 2 + 0.16);
    this.group.add(sign);
    this.exitSign = sign;
  }

  update(dt) {
    this.door.update(dt);
    this.lighting.update(dt);
  }
}
