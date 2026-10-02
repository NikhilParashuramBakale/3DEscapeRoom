import * as THREE from 'three';
import { makePaperTexture } from './Materials.js';
import { CODE_SHEET_LINES } from '../puzzles/CodeSheet.js';

/**
 * Props - environmental set dressing.
 *
 * Each builder returns a Group and (optionally) registers colliders so the
 * player cannot walk through solid furniture. Demonstrates 3D modelling and
 * the translation / rotation / scaling transforms.
 */
export class Props {
  constructor(materials) {
    this.m = materials;
  }

  /**
   * Add a group, position it, then register its world-space collider.
   * The collider is inflated slightly by the player radius (see
   * PlayerController._collides) so the player never clips into furniture.
   */
  add(scene, group, colliders, { x = 0, y = 0, z = 0, rotY = 0, block = true } = {}) {
    group.position.set(x, y, z);
    if (rotY) group.rotation.y = rotY;
    scene.add(group);
    if (block) {
      const box = new THREE.Box3().setFromObject(group);
      colliders.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, top: box.max.y });
    }
    return group;
  }

  /**
   * Lab desk (west side).
   *
   * The pedestal on the left holds a real drawer: a recessed front panel, a
   * pull handle and a small lock plate. The drawer group is returned as
   * `g.userData.drawer` so a later phase can slide it open along +Z.
   */
  buildDesk() {
    const m = this.m;
    const g = new THREE.Group();
    g.name = 'Desk';

    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.1), m.wood);
    top.position.y = 0.92;
    top.castShadow = true;
    top.receiveShadow = true;
    g.add(top);

    // Pedestal on the left (drawer lives here) and legs on the right.
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.88, 1.0), m.woodDark);
    pedestal.position.set(-1.1, 0.44, 0);
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    g.add(pedestal);

    for (const z of [-0.45, 0.45]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), m.darkMetal);
      leg.position.set(1.45, 0.45, z);
      leg.castShadow = true;
      g.add(leg);
    }

    // ---- Drawer (lives in the pedestal, opens towards +Z / the player) ----
    const drawer = new THREE.Group();
    drawer.name = 'Drawer';
    drawer.position.set(-1.1, 0, 0); // slide +Z to open

    const DW = 0.78;
    const DH = 0.56;
    const front = new THREE.Mesh(new THREE.BoxGeometry(DW, DH, 0.05), m.wood);
    front.position.set(0, 0.5, 0.52);
    front.castShadow = true;
    drawer.add(front);

    // Shallow tray so the drawer does not look hollow when it slides out.
    const tray = new THREE.Mesh(new THREE.BoxGeometry(DW - 0.06, 0.02, 0.82), m.woodDark);
    tray.position.set(0, 0.5 - DH / 2 + 0.02, 0.1);
    drawer.add(tray);
    for (const [tx, ty, tz, sx, sy, sz] of [
      [-(DW - 0.06) / 2, 0.5 - DH / 4, 0.1, 0.02, DH / 2, 0.82],
      [(DW - 0.06) / 2, 0.5 - DH / 4, 0.1, 0.02, DH / 2, 0.82],
      [0, 0.5 - DH / 2 + 0.02, -0.3, DW - 0.06, DH / 2, 0.02],
    ]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m.woodDark);
      side.position.set(tx, ty, tz);
      drawer.add(side);
    }

    // Recessed finger pull along the top of the drawer front.
    const pull = new THREE.Mesh(new THREE.BoxGeometry(DW * 0.45, 0.05, 0.06), m.darkMetal);
    pull.position.set(0, 0.5 + DH / 2 - 0.08, 0.54);
    drawer.add(pull);

    // Small lock plate with a keyhole - the keypad replaces this in Phase 7.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.02), m.metal);
    plate.position.set(DW / 2 - 0.1, 0.5 - 0.12, 0.53);
    plate.name = 'LockPlate';
    drawer.add(plate);
    const keyhole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), m.darkMetal);
    keyhole.rotation.x = Math.PI / 2;
    keyhole.position.set(DW / 2 - 0.1, 0.5 - 0.12, 0.545);
    keyhole.name = 'Keyhole';
    drawer.add(keyhole);

    // The key the player eventually finds inside (Phase 7). It starts hidden so
    // it cannot be picked up before the drawer is open.
    const key = new THREE.Group();
    key.name = 'DrawerKey';
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), m.metal);
    shaft.rotation.z = Math.PI / 2;
    key.add(shaft);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.011, 8, 14), m.metal);
    bow.position.x = -0.1;
    bow.rotation.y = Math.PI / 2;
    key.add(bow);
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.012), m.metal);
    bit.position.set(0.06, -0.028, 0);
    key.add(bit);
    key.position.set(0, 0.34, 0.2);
    key.rotation.y = 0.5;
    key.visible = false;
    drawer.add(key);
    g.userData.drawerKey = key;

    g.add(drawer);
    g.userData.drawer = drawer;

    // Modesty panel.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.05), m.woodDark);
    panel.position.set(0.1, 0.68, -0.45);
    g.add(panel);

    return g;
  }

  /**
   * The programming note the player reads on the desk (Phase 5).
   *
   * Built as its own group rather than a child of the desk: InteractiveObject
   * clones and tints every mesh under whatever it is given, so keeping the
   * sheet outside the desk group stops "Examine Desk" from lighting up the
   * note as a side effect. `add(...)` is called with `block: false` because the
   * desk collider already covers the area it lies on.
   */
  buildCodeSheet() {
    const sheet = new THREE.Group();
    sheet.name = 'CodeSheet';

    // makePaperTexture returns a portrait canvas (1 : 1.4), so the plane keeps
    // that ratio and the text is not stretched.
    // Height budget matters here. The desk top is a box centred on y = 0.92 with
    // a height of 0.08, so its upper surface sits at exactly y = 0.96. A plane
    // placed at the same height is coplanar with it and z-fights, which shows up
    // as the paper flickering in and out as the camera moves. Both sheets below
    // therefore sit clearly above 0.96, plus a polygon offset as a belt-and-
    // braces guard against any residual depth precision error at a distance.
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.476),
      new THREE.MeshStandardMaterial({
        map: makePaperTexture(CODE_SHEET_LINES),
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    paper.rotation.x = -Math.PI / 2; // face up
    paper.receiveShadow = true;
    paper.position.y = 0.015;
    sheet.add(paper);

    // A slightly larger sheet peeking out underneath reads as a small stack.
    // It is a child of the paper's plane, not the desk surface, so it can never
    // become coplanar with the desk top.
    const under = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.5), this.m.woodDark);
    under.rotation.x = -Math.PI / 2;
    under.position.set(0.014, 0.004, 0.014);
    sheet.add(under);

    return sheet;
  }

  buildChair() {
    const m = this.m;
    const g = new THREE.Group();
    g.name = 'Chair';

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), m.plastic);
    seat.position.y = 0.46;
    seat.castShadow = true;
    g.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.07), m.plastic);
    back.position.set(0, 0.72, -0.22);
    back.castShadow = true;
    g.add(back);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42), m.darkMetal);
    post.position.y = 0.24;
    g.add(post);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.05), m.darkMetal);
    base.position.y = 0.03;
    g.add(base);

    return g;
  }

  buildCrates(count = 3) {
    const m = this.m;
    const g = new THREE.Group();
    g.name = 'Crates';
    const spots = [
      [-6.4, 0, 3.6, 0.35],
      [-5.7, 0, 4.3, -0.5],
      [-6.2, 0.72, 3.7, 0.9], // stacked on top of the first
    ];
    for (let i = 0; i < Math.min(count, spots.length); i++) {
      const [x, y, z, rot] = spots[i];
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), m.woodDark);
      crate.position.set(x, y + 0.35, z);
      crate.rotation.y = rot; // rotation transform
      crate.castShadow = true;
      crate.receiveShadow = true;
      g.add(crate);
    }
    return g;
  }

  buildLockers() {
    const m = this.m;
    const g = new THREE.Group();
    g.name = 'Lockers';
    const x0 = 4.4;
    for (let i = 0; i < 3; i++) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.5), m.metal);
      body.position.set(x0 + i * 0.62, 0.95, -4.2);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.02), m.darkMetal);
      vent.position.set(x0 + i * 0.62, 1.65, -3.94);
      g.add(vent);
    }
    return g;
  }

  buildShelf() {
    const m = this.m;
    const g = new THREE.Group();
    g.name = 'Shelf';
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.35), m.woodDark);
    board.position.set(-4.5, 1.4, -4.6);
    board.castShadow = true;
    g.add(board);
    for (const dx of [-1.2, 1.2]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.3), m.darkMetal);
      bracket.position.set(-4.5 + dx, 1.24, -4.6);
      g.add(bracket);
    }
    // A few jars / flasks.
    for (let i = 0; i < 4; i++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10), m.glass);
      jar.position.set(-5.4 + i * 0.55, 1.52, -4.6);
      g.add(jar);
    }
    return g;
  }

  buildPipes() {
    const m = this.m;
    const g = new THREE.Group();
    g.name = 'Pipes';
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 12, 10), m.metal);
    pipe.rotation.z = Math.PI / 2; // rotation transform
    pipe.position.set(0, 3.15, -5.6);
    pipe.castShadow = true;
    g.add(pipe);
    return g;
  }

  buildExitSign(x, y, z) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.06), this.m.exitSign);
    sign.position.set(x, y, z);
    return sign;
  }
}
