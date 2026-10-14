import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Small procedural-geometry kit: a Batch collects primitives (boxes, cylinders, rings) under a material key, with an
// optional local transform, and merges each key into ONE mesh. Every static piece of equipment goes through it, so the
// hall's thousands of parts cost a handful of draw calls.

export type Axis = 'x' | 'y' | 'z';

const AXIS_Q: Record<Axis, THREE.Quaternion> = {
  x: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
  y: new THREE.Quaternion(),
  z: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
};

export class Batch {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [];
  /** Current local-to-world transform, applied to every part added. */
  m = new THREE.Matrix4();

  /** Run `fn` with parts placed at (x, z) and turned by `yaw` (local +z -> world (sin yaw, cos yaw)). */
  at(x: number, z: number, yaw: number, fn: () => void, y = 0): void {
    this.stack.push(this.m.clone());
    this.m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
    fn();
    this.m = this.stack.pop()!;
  }

  add(key: string, g: THREE.BufferGeometry): THREE.BufferGeometry {
    g.applyMatrix4(this.m);
    let l = this.parts.get(key);
    if (!l) this.parts.set(key, (l = []));
    l.push(g);
    return g;
  }

  /** Box from min/max corners. */
  box(key: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(key, g);
  }

  /** Box from centre and size. */
  boxC(key: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    this.box(key, cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2);
  }

  /** Cylinder (or cone frustum) along an axis, centred at (cx, cy, cz). */
  cyl(key: string, cx: number, cy: number, cz: number, r: number, len: number, axis: Axis = 'y', seg = 20, rTop = r): void {
    const g = new THREE.CylinderGeometry(rTop, r, len, seg, 1, false);
    g.applyQuaternion(AXIS_Q[axis]);
    g.translate(cx, cy, cz);
    this.add(key, g);
  }

  /** Torus ring around an axis (flanges, guards, bezels). */
  ring(key: string, cx: number, cy: number, cz: number, R: number, r: number, axis: Axis = 'z', seg = 32, tube = 6): void {
    const g = new THREE.TorusGeometry(R, r, tube, seg);
    // Torus lies in the xy plane (axis z); turn it to the requested axis.
    if (axis === 'x') g.rotateY(Math.PI / 2);
    else if (axis === 'y') g.rotateX(Math.PI / 2);
    g.translate(cx, cy, cz);
    this.add(key, g);
  }

  /** Sphere (domes, bolt heads). */
  ball(key: string, cx: number, cy: number, cz: number, r: number, seg = 12): void {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1));
    g.translate(cx, cy, cz);
    this.add(key, g);
  }

  /** Cylinder between two points. */
  tube(key: string, a: THREE.Vector3Like, b: THREE.Vector3Like, r: number, seg = 10): void {
    const va = new THREE.Vector3(a.x, a.y, a.z);
    const vb = new THREE.Vector3(b.x, b.y, b.z);
    const d = vb.clone().sub(va);
    const len = d.length();
    if (len < 1e-6) return;
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
    this.add(key, g);
  }

  keys(): string[] {
    return [...this.parts.keys()];
  }

  /** Merge a key into one geometry (null when empty). */
  geometry(key: string): THREE.BufferGeometry | null {
    const l = this.parts.get(key);
    if (!l?.length) return null;
    const g = mergeGeometries(l, false);
    l.forEach((p) => p.dispose());
    this.parts.delete(key);
    return g;
  }

  /** Merge every key into a mesh using materials[key]; keys in `shadow` cast shadows. */
  build(materials: Record<string, THREE.Material>, shadow: string[] = [], name = 'batch'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const key of this.keys()) {
      const g = this.geometry(key)!;
      const mat = materials[key];
      if (!mat) throw new Error(`no material for batch key ${key}`);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = `${name}:${key}`;
      mesh.castShadow = shadow.includes(key);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    return group;
  }
}

/** Plane lying flat at height y; its uv is world x/z divided by `tile` so tiles line up across separate pieces. */
export function flatPlane(x0: number, x1: number, z0: number, z1: number, y: number, tile = 0.6): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, -p.getZ(i) / tile);
  return g;
}

/** Vertical plane between two floor points (a -> b), spanning y0..y1; faces the left of the a->b direction. uv in metres / tile. */
export function wallPlane(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, tile = 1.2): THREE.BufferGeometry {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.PlaneGeometry(len, y1 - y0);
  const yaw = Math.atan2(-(bz - az), bx - ax);
  g.rotateY(yaw);
  g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / tile, (uv.getY(i) * (y1 - y0)) / 1.7);
  return g;
}

/** Scale a geometry's uv (repeat). */
export function scaleUV(g: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** Deterministic pseudo-random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Make an InstancedMesh material blink per instance: attribute `aBlink` = (rate Hz, phase 0..1); brightness is a soft
 * square wave of that rate. A rate of 0 means steady.
 */
export function blinkMaterial(base: THREE.MeshBasicMaterial, time: { value: number }): THREE.MeshBasicMaterial {
  base.onBeforeCompile = (sh) => {
    sh.uniforms.uBlinkT = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aBlink;\nuniform float uBlinkT;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nfloat ph = fract(uBlinkT * aBlink.x + aBlink.y);\nfloat on = aBlink.x > 0.0 ? (0.25 + 0.75 * smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.38, 0.5, ph))) : 1.0;\nvColor *= on;\n#endif');
  };
  base.customProgramCacheKey = () => 'ledBlink';
  return base;
}

/**
 * Add the instance colour to the emissive term (a coloured glow that does not depend on light): rack doors glow with the
 * rack temperature, battery cells with their charge. `k` = glow strength; with `useMap` the glow is modulated by the
 * material's colour map (server fronts: a dim self-lit bezel that shows through the door perforations).
 */
export function instanceGlow(mat: THREE.MeshStandardMaterial, k: number, useMap = false): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (sh) => {
    const expr = useMap ? `vColor.rgb * texture2D( map, vMapUv ).rgb * ${k.toFixed(3)}` : `vColor.rgb * ${k.toFixed(3)}`;
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance += ${expr};\n#endif`);
  };
  mat.customProgramCacheKey = () => `instGlow${k}${useMap ? 'm' : ''}`;
  return mat;
}
