import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSmoothed } from '../live/hooks';
import type { TagName } from '../live/paths';
import { M } from './materials';
import { merge, boxAt } from './geo';

/** Polyline with rounded corners as a CurvePath, so a tube follows it without twisting. */
export function roundedPath(points: THREE.Vector3[], fillet = 3): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cursor = points[0].clone();
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const a = new THREE.Vector3().subVectors(points[i - 1], p);
    const b = new THREE.Vector3().subVectors(points[i + 1], p);
    const f = Math.min(fillet, a.length() / 2, b.length() / 2);
    const inP = p.clone().addScaledVector(a.normalize(), f);
    const outP = p.clone().addScaledVector(b.normalize(), f);
    if (cursor.distanceTo(inP) > 1e-4) path.add(new THREE.LineCurve3(cursor.clone(), inP));
    path.add(new THREE.QuadraticBezierCurve3(inP, p.clone(), outP));
    cursor = outP;
  }
  path.add(new THREE.LineCurve3(cursor, points[points.length - 1].clone()));
  return path;
}

const DASH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const DASH_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uLen;
uniform float uPhase;
uniform float uInt;
uniform vec3 uColor;
void main() {
  float d = fract(vUv.x * uLen / 7.0 - uPhase);
  float dash = smoothstep(0.0, 0.12, d) * (1.0 - smoothstep(0.42, 0.55, d));
  float a = dash * uInt;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a * 2.0, a);
}
`;

interface FlowLineProps {
  points: THREE.Vector3[];
  /** Flow tag; its sign gives direction (negative = reverse). */
  tag: TagName;
  /** Flow that drives dashes at full brightness (tag units). */
  fullScale: number;
  color: THREE.ColorRepresentation;
  radius?: number;
  insulated?: boolean;
  /** Divide the tag by this before use (e.g. Lpm -> fraction). Default 1. */
  supports?: boolean;
}

/** Insulated pipe with an additive dash overlay whose speed and brightness follow a flow tag. */
export function FlowLine({ points, tag, fullScale, color, radius = 0.5, insulated = true, supports = true }: FlowLineProps) {
  const flow = useSmoothed(tag, 900);
  const phase = useRef(0);
  const { pipe, overlay, length, support } = useMemo(() => {
    const path = roundedPath(points);
    const len = path.getLength();
    const seg = Math.max(24, Math.round(len * 0.9));
    const pipeGeo = new THREE.TubeGeometry(path, seg, radius, 10, false);
    const overlayGeo = new THREE.TubeGeometry(path, seg, radius + 0.07, 10, false);
    let sup: THREE.BufferGeometry | null = null;
    if (supports) {
      const parts: THREE.BufferGeometry[] = [];
      for (let d = 4; d < len; d += 9) {
        const p = path.getPointAt(d / len);
        if (p.y < 3.2) parts.push(boxAt(0.5, p.y + 0.2, 1.4, p.x, (p.y - radius) / 2, p.z));
      }
      if (parts.length) sup = merge(parts);
    }
    return { pipe: pipeGeo, overlay: overlayGeo, length: len, support: sup };
  }, [points, radius, supports]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: DASH_VERT,
        fragmentShader: DASH_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: {
          uLen: { value: length },
          uPhase: { value: 0 },
          uInt: { value: 0 },
          uColor: { value: new THREE.Color(color) },
        },
      }),
    [length, color],
  );
  useEffect(
    () => () => {
      pipe.dispose();
      overlay.dispose();
      support?.dispose();
      mat.dispose();
    },
    [pipe, overlay, support, mat],
  );

  useFrame((_, dt) => {
    const f = flow.v / fullScale;
    phase.current += f * Math.min(dt, 0.1) * 1.6;
    mat.uniforms.uPhase.value = phase.current;
    mat.uniforms.uInt.value = Math.min(1, Math.abs(f) * 1.5) * (Math.abs(f) > 0.01 ? 1 : 0);
  });

  return (
    <group>
      <mesh geometry={pipe} material={insulated ? M.pipe : M.steel} castShadow />
      <mesh geometry={overlay} material={mat} renderOrder={2} />
      {support && <mesh geometry={support} material={M.steelDark} />}
    </group>
  );
}
