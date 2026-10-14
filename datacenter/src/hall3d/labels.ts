import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CRAHS, EQUIP, ROW_NAMES, ROOF_Y, rackPos } from './geometry';

// Floor-aligned text labels: one canvas atlas, one merged mesh.

interface Label {
  text: string;
  x: number;
  y: number;
  z: number;
  w: number;
  /** Rotation about Y (text runs along +x at 0). */
  rot?: number;
}

function labels(): Label[] {
  const out: Label[] = [];
  ROW_NAMES.forEach((r, i) => out.push({ text: `ROW ${r}`, x: -0.55, y: 0.02, z: rackPos(i * 10 + 1).z, w: 1.0, rot: Math.PI / 2 }));
  CRAHS.forEach((c) => out.push(c.n === 4 ? { text: 'CRAH 4 ASSIST', x: c.x, y: 0.02, z: c.z + 1.0, w: 1.6 } : { text: `CRAH ${c.n}`, x: c.x - 1.35, y: 0.02, z: c.z, w: 1.1, rot: Math.PI / 2 }));
  for (const e of EQUIP) {
    if (e.kind === 'pdu') continue;
    const t = e.kind === 'ups' ? `UPS ${e.id}` : e.kind === 'ats' ? 'ATS' : e.kind === 'generator' ? 'GENERATOR' : 'UTILITY';
    out.push({ text: t, x: e.x, y: 0.02, z: e.z + e.sz / 2 + 0.55, w: 1.3 });
  }
  out.push({ text: 'PDU A1/B1', x: -1.1, y: 0.02, z: 3.2, w: 0.9, rot: Math.PI / 2 });
  out.push({ text: 'PDU A2/B2', x: -1.1, y: 0.02, z: 8.2, w: 0.9, rot: Math.PI / 2 });
  out.push({ text: 'PDU A3/B3', x: -1.1, y: 0.02, z: 13.2, w: 0.9, rot: Math.PI / 2 });
  out.push({ text: 'CHILLER 1', x: 13.0, y: ROOF_Y + 0.02, z: 3.4, w: 1.6 });
  out.push({ text: 'CHILLER 2', x: 13.0, y: ROOF_Y + 0.02, z: 9.4, w: 1.6 });
  return out;
}

export function createLabels(): THREE.Mesh {
  const L = labels();
  const cols = 4;
  const rows = Math.ceil(L.length / cols);
  const cw = 256;
  const ch = 64;
  const c = document.createElement('canvas');
  c.width = cols * cw;
  c.height = rows * ch;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9d6e6';
  g.font = '600 34px ui-monospace, "JetBrains Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  L.forEach((l, i) => g.fillText(l.text, (i % cols) * cw + cw / 2, Math.floor(i / cols) * ch + ch / 2 + 2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const parts = L.map((l, i) => {
    const p = new THREE.PlaneGeometry(l.w, l.w * (ch / cw));
    p.rotateX(-Math.PI / 2);
    p.rotateY(l.rot ?? 0);
    p.translate(l.x, l.y, l.z);
    const uv = p.getAttribute('uv');
    const u0 = (i % cols) / cols;
    const v0 = 1 - (Math.floor(i / cols) + 1) / rows;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / cols, v0 + uv.getY(k) / rows);
    return p.toNonIndexed();
  });
  const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = 1;
  mesh.name = 'labels';
  return mesh;
}
