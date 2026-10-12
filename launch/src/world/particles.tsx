import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { wind } from './wind';

/**
 * CPU-simulated billboard particles drawn as one instanced mesh per system. Typed arrays are updated
 * in place every frame; React never sees a particle.
 */

export interface ParticleOptions {
  max: number;
  texture: THREE.Texture;
  additive?: boolean;
  /** Point size (metres, before perspective) at birth and death. */
  sizeStart: number;
  sizeEnd: number;
  colorStart: THREE.ColorRepresentation;
  colorEnd: THREE.ColorRepresentation;
  /** Peak opacity multiplier (HDR values > 1 are fine with additive blending + bloom). */
  alpha: number;
  /** Exponent of the fade-out (1 - u)^fadePow. */
  fadePow?: number;
  /** Linear drag, 1/s. */
  drag?: number;
  /** Gravity, m/s^2 (negative values rise). */
  gravity?: number;
  /** How strongly the wind drags particles (0..1). */
  windInfluence?: number;
  /** Spin in radians over a lifetime. */
  spin?: number;
}

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute float iU;
attribute float iSeed;
attribute float iScale;
uniform float uSize0;
uniform float uSize1;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uAlpha;
uniform float uFade;
uniform float uSpin;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  float u = clamp(iU, 0.0, 1.0);
  float size = iU >= 1.0 ? 0.0 : mix(uSize0, uSize1, sqrt(u)) * iScale;
  float ang = iSeed * 6.2831853 + u * uSpin;
  float c = cos(ang);
  float s = sin(ang);
  vec2 q = position.xy * size;
  vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += r;
  gl_Position = projectionMatrix * mv;
  float a = uAlpha * smoothstep(0.0, 0.07, u) * pow(max(1.0 - u, 0.0), uFade);
  vColor = vec4(mix(uColA, uColB, u), a);
  vUv = position.xy + 0.5;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vColor.a;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb, a);
}
`;

export class ParticleSystem {
  readonly points: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly max: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly u: Float32Array;
  private readonly life: Float32Array;
  private readonly seed: Float32Array;
  private readonly scale: Float32Array;
  private readonly aU: THREE.InstancedBufferAttribute;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aScale: THREE.InstancedBufferAttribute;
  private readonly drag: number;
  private readonly gravity: number;
  private readonly windInfl: number;
  private cursor = 0;
  private readonly geometry: THREE.InstancedBufferGeometry;

  constructor(o: ParticleOptions) {
    this.max = o.max;
    this.pos = new Float32Array(o.max * 3);
    this.vel = new Float32Array(o.max * 3);
    this.u = new Float32Array(o.max).fill(1);
    this.life = new Float32Array(o.max).fill(1);
    this.seed = new Float32Array(o.max);
    this.scale = new Float32Array(o.max).fill(1);
    for (let i = 0; i < o.max; i++) this.seed[i] = Math.random();
    this.drag = o.drag ?? 0.2;
    this.gravity = o.gravity ?? 0;
    this.windInfl = o.windInfluence ?? 0.6;

    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.instanceCount = o.max;
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aU = new THREE.InstancedBufferAttribute(this.u, 1).setUsage(THREE.DynamicDrawUsage);
    this.aScale = new THREE.InstancedBufferAttribute(this.scale, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iU', this.aU);
    g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(this.seed, 1));
    g.setAttribute('iScale', this.aScale);
    this.geometry = g;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uMap: { value: o.texture },
        uSize0: { value: o.sizeStart },
        uSize1: { value: o.sizeEnd },
        uColA: { value: new THREE.Color(o.colorStart) },
        uColB: { value: new THREE.Color(o.colorEnd) },
        uAlpha: { value: o.alpha },
        uFade: { value: o.fadePow ?? 1.5 },
        uSpin: { value: o.spin ?? 1.2 },
      },
    });
    this.points = new THREE.Mesh(g, this.material);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, scale = 1): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.u[i] = 0;
    this.life[i] = life;
    this.scale[i] = scale;
    this.aScale.needsUpdate = true;
  }

  update(dtRaw: number): void {
    const dt = Math.min(dtRaw, 0.1);
    const { pos, vel, u, life, max } = this;
    const dragK = Math.exp(-this.drag * dt);
    const w = wind.vec;
    const wi = this.windInfl;
    for (let i = 0; i < max; i++) {
      if (u[i] >= 1) continue;
      u[i] += dt / life[i];
      if (u[i] >= 1) {
        u[i] = 1;
        continue;
      }
      const i3 = i * 3;
      vel[i3 + 1] -= this.gravity * dt;
      // relax toward wind velocity as well as damping
      vel[i3] = w.x * wi + (vel[i3] - w.x * wi) * dragK;
      vel[i3 + 1] *= dragK;
      vel[i3 + 2] = w.z * wi + (vel[i3 + 2] - w.z * wi) * dragK;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
    }
    this.aPos.needsUpdate = true;
    this.aU.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Create a system once per component instance and dispose it on unmount. */
export function useParticleSystem(make: () => ParticleOptions): ParticleSystem {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sys = useMemo(() => new ParticleSystem(make()), []);
  useEffect(() => () => sys.dispose(), [sys]);
  return sys;
}

/** Renders the system and advances it every frame. Emission is done by the owner's own useFrame. */
export function Particles({ sys }: { sys: ParticleSystem }) {
  useFrame((_, dt) => sys.update(dt));
  return <primitive object={sys.points} />;
}

/** Fractional-rate emitter: call tick(rate, dt, fn) every frame. */
export class Emitter {
  private acc = 0;
  tick(rate: number, dt: number, fn: () => void, cap = 40): void {
    this.acc += Math.max(0, rate) * Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= 1 && n < cap) {
      this.acc -= 1;
      n++;
      fn();
    }
    if (this.acc > 2) this.acc = 0;
  }
}
