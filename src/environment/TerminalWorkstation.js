import * as THREE from 'three';
import { makeCanvasTexture } from './Materials.js';

/**
 * TerminalWorkstation - Station 01 in Room 2: The Proctor Chamber.
 *
 * Implements the 3D examination desk, housing, procedural canvas screen,
 * status lamp, power indicator LED strip, and interaction proxy.
 */
export class TerminalWorkstation {
  constructor(materials) {
    this.materials = materials;
    this.group = new THREE.Group();
    this.group.name = 'TerminalWorkstation';

    this.active = false;
    this._buildDesk();
  }

  _buildDesk() {
    const m = this.materials;
    const g = this.group;

    // Sturdy metal desk top.
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.85), m.darkMetal);
    top.position.y = 0.82;
    top.receiveShadow = true;
    g.add(top);

    // Pedestal supports on left and right.
    for (const x of [-0.6, 0.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.7), m.darkMetal);
      leg.position.set(x, 0.41, 0);
      leg.receiveShadow = true;
      g.add(leg);
    }

    // Angled monitor housing.
    const monitorBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.65, 0.25), m.darkMetal);
    monitorBox.position.set(0, 1.25, -0.15);
    monitorBox.rotation.x = -0.15;
    g.add(monitorBox);

    // Monitor screen with custom procedural canvas.
    this.screenTex = this._makeScreenTexture(false);
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.screenTex });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), this.screenMat);
    screen.position.set(0, 1.25, -0.02);
    screen.rotation.x = -0.15;
    g.add(screen);
    this.screen = screen;

    // Status lamp on top of the monitor.
    this.lampMat = new THREE.MeshStandardMaterial({
      color: 0xffaa22,
      emissive: 0xffaa22,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });
    this.statusLamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), this.lampMat);
    this.statusLamp.position.set(0, 1.62, -0.18);
    g.add(this.statusLamp);

    // Power indicator LED strip across the front.
    this.powerMat = new THREE.MeshStandardMaterial({
      color: 0x553311,
      emissive: 0x332211,
      emissiveIntensity: 0.4,
      roughness: 0.4,
    });
    this.powerBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.04), this.powerMat);
    this.powerBar.position.set(0, 0.86, 0.38);
    g.add(this.powerBar);

    // Terminal keyboard.
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.02, 0.25), m.darkMetal);
    kb.position.set(0, 0.84, 0.18);
    g.add(kb);

    // Invisible interaction proxy for the terminal.
    this.proxy = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.2, 0.7),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    this.proxy.name = 'TerminalProxy';
  }

  /** Dynamic canvas texture showing the code snippet and live status. */
  _makeScreenTexture(active = false) {
    return makeCanvasTexture(512, (ctx, s) => {
      // Dark background
      ctx.fillStyle = active ? '#041610' : '#081014';
      ctx.fillRect(0, 0, s, s);

      // Bezel border
      ctx.strokeStyle = active ? '#00ff88' : '#7ff0d8';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, s - 16, s - 16);

      // Header bar
      ctx.fillStyle = active ? 'rgba(0, 255, 136, 0.2)' : 'rgba(127, 240, 216, 0.15)';
      ctx.fillRect(8, 8, s - 16, 52);

      ctx.fillStyle = active ? '#00ff88' : '#7ff0d8';
      ctx.font = 'bold 22px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('PROCTOR OS v4.2 // TERMINAL 01', 24, 42);

      // Code lines
      ctx.fillStyle = '#b0c4de';
      ctx.font = '18px Consolas, monospace';
      ctx.fillText('Language: C++17', 24, 90);
      ctx.fillText('int a[5] = {3, 1, 4, 1, 5};', 24, 125);
      ctx.fillText('int s = 0;', 24, 155);
      ctx.fillText('for (int i=0; i<5; i+=2) s += a[i];', 24, 185);
      ctx.fillText('std::cout << s;', 24, 215);

      // Status indicator box
      ctx.fillStyle = active ? '#003318' : '#221100';
      ctx.fillRect(24, 270, s - 48, 70);
      ctx.strokeStyle = active ? '#00ff88' : '#ffaa22';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 270, s - 48, 70);

      ctx.fillStyle = active ? '#00ff88' : '#ffaa22';
      ctx.font = 'bold 20px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(active ? 'STATUS: [POWER RESTORED — PASS]' : 'STATUS: [EXAMINATION AWAITING INPUT]', s / 2, 312);

      if (active) {
        ctx.fillStyle = '#7ff0d8';
        ctx.font = 'bold 22px Consolas, monospace';
        ctx.fillText('CERTIFICATE α — VALUE: 12', s / 2, 385);
      } else {
        ctx.fillStyle = '#7ff0d8';
        ctx.font = 'bold 20px Consolas, monospace';
        ctx.fillText('[PRESS E TO INSPECT TERMINAL]', s / 2, 385);
      }
    });
  }

  /** Activate Station 01 terminal visuals upon correct diagnostic solve. */
  activate() {
    this.active = true;
    if (this.lampMat) {
      this.lampMat.color.setHex(0x00ff88);
      this.lampMat.emissive.setHex(0x00ff88);
      this.lampMat.emissiveIntensity = 1.6;
    }
    if (this.powerMat) {
      this.powerMat.color.setHex(0x00ff88);
      this.powerMat.emissive.setHex(0x00ff88);
      this.powerMat.emissiveIntensity = 1.4;
    }
    if (this.screenMat) {
      this.screenMat.map = this._makeScreenTexture(true);
      this.screenMat.needsUpdate = true;
    }
  }
}
