import * as THREE from 'three';

/**
 * Materials - a single shared material library for the whole laboratory.
 *
 * Demonstrates: procedural textures (canvas -> CanvasTexture), material types
 * (standard / emissive / transparent) and material reuse for performance.
 * Nothing is generated more than once - all meshes share these instances.
 */

export function makeCanvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Seamless floor tiles with grout lines and subtle wear. */
export function makeFloorTexture(size = 512) {
  return makeCanvasTexture(
    size,
    (ctx, s) => {
      const tiles = 4;
      const step = s / tiles;
      ctx.fillStyle = '#20262b';
      ctx.fillRect(0, 0, s, s);

      for (let y = 0; y < tiles; y++) {
        for (let x = 0; x < tiles; x++) {
          const shade = 78 + ((x + y) % 2) * 14;
          ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 8})`;
          ctx.fillRect(x * step + 2, y * step + 2, step - 4, step - 4);
        }
      }

      ctx.strokeStyle = '#0d1114';
      ctx.lineWidth = 3;
      for (let i = 0; i <= tiles; i++) {
        ctx.beginPath();
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step, s);
        ctx.moveTo(0, i * step);
        ctx.lineTo(s, i * step);
        ctx.stroke();
      }

      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3);
      }
    },
    4,
    4
  );
}

/** Wall panels: vertical seams, a darker wainscot band, light staining. */
export function makeWallTexture(size = 512) {
  return makeCanvasTexture(
    size,
    (ctx, s) => {
      ctx.fillStyle = '#6d7a84';
      ctx.fillRect(0, 0, s, s);

      ctx.strokeStyle = '#525d66';
      ctx.lineWidth = 4;
      for (let i = 0; i <= 4; i++) {
        const p = (i * s) / 4;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, s);
        ctx.stroke();
      }

      ctx.fillStyle = '#525c64';
      ctx.fillRect(0, s * 0.72, s, s * 0.28);
      ctx.fillStyle = '#828d96';
      ctx.fillRect(0, s * 0.72, s, 5);

      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(40,50,58,${Math.random() * 0.25})`;
        const r = 20 + Math.random() * 70;
        ctx.beginPath();
        ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    3,
    1
  );
}

/** Ceiling: perforated acoustic tiles. */
export function makeCeilingTexture(size = 256) {
  return makeCanvasTexture(
    size,
    (ctx, s) => {
      ctx.fillStyle = '#79858e';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#69747c';
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          ctx.beginPath();
          ctx.arc((x + 0.5) * (s / 8), (y + 0.5) * (s / 8), 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = '#394045';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, s, s);
    },
    6,
    4
  );
}

/** Brushed metal for lockers, pipes and machine parts. */
export function makeMetalTexture(size = 256) {
  return makeCanvasTexture(
    size,
    (ctx, s) => {
      ctx.fillStyle = '#6b747a';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 700; i++) {
        const g = 110 + Math.random() * 60;
        ctx.strokeStyle = `rgba(${g},${g + 5},${g + 8},0.25)`;
        ctx.beginPath();
        const y = Math.random() * s;
        ctx.moveTo(0, y);
        ctx.lineTo(s, y);
        ctx.stroke();
      }
    },
    2,
    2
  );
}

/** Aged paper used by the programming sheet (Phase 5). */
export function makePaperTexture(code, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.round(size * 1.4);
  const ctx = canvas.getContext('2d');
  const h = canvas.height;

  ctx.fillStyle = '#ded4bd';
  ctx.fillRect(0, 0, size, h);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(120,100,60,${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * size, Math.random() * h, 4, 4);
  }

  ctx.fillStyle = '#1d2a33';
  ctx.font = 'bold 24px Consolas, monospace';
  ctx.fillText('LAB NOTE #6 - RECURSION DRILL', 30, 50);
  ctx.strokeStyle = '#1d2a33';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(30, 60);
  ctx.lineTo(size - 30, 60);
  ctx.stroke();

  ctx.font = '19px Consolas, monospace';
  code.forEach((line, i) => ctx.fillText(line, 30, 100 + i * 26));

  ctx.font = 'bold 22px Consolas, monospace';
  ctx.fillText('Keypad lock -> this value', 30, h - 60);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Build (once) and return every shared material used by the laboratory. */
export function createMaterials() {
  const floorTex = makeFloorTexture();
  const wallTex = makeWallTexture();
  const ceilTex = makeCeilingTexture();
  const metalTex = makeMetalTexture();

  return {
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.05 }),
    wall: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95, metalness: 0.0 }),
    ceiling: new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1.0, metalness: 0.0 }),
    metal: new THREE.MeshStandardMaterial({
      map: metalTex,
      color: 0x9aa5ad,
      roughness: 0.45,
      metalness: 0.85,
    }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2b3339, roughness: 0.5, metalness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 0.8 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x3d2a1c, roughness: 0.85 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.6, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xaadfe0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.25,
    }),
    lampOn: new THREE.MeshStandardMaterial({
      color: 0xdff6ff,
      emissive: 0xbfe8ff,
      emissiveIntensity: 1.6,
    }),
    lampOff: new THREE.MeshStandardMaterial({ color: 0x3a4248, emissive: 0x101418, emissiveIntensity: 0.1 }),
    exitSign: new THREE.MeshStandardMaterial({
      map: makeLabelTexture('EXIT'),
      emissiveMap: makeLabelTexture('EXIT'),
      emissive: 0xffffff,
      emissiveIntensity: 1.2,
    }),
    doorPanel: new THREE.MeshStandardMaterial({ color: 0x3c4a44, roughness: 0.6, metalness: 0.35 }),
  };
}

/** Sign / label plate (EXIT sign, machine panels). */
export function makeLabelTexture(text, bg = '#0e1418', fg = '#7ff0d8') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = fg;
  ctx.font = 'bold 50px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

