import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { bool, num, str } from '../live/store';
import { smoothDamp } from '../live/smoothing';
import { motion } from '../motion';
import { vehicle } from '../world/vehicleState';
import { directedPreset } from './director';
import { follow, followAnchor, resolveShot, type PresetId, type Shot } from './presets';
import { getCameraState, selectPreset } from './store';

/**
 * Camera rig: eased transitions between presets (position, target and field of view), orbit controls
 * with damping when the user drags, an idle return after 20 s, and the auto-director. All of it runs
 * in useFrame against refs and plain module state; React never re-renders for a camera move.
 */

const TRANSITION_S = 2.6;
const IDLE_RETURN_S = 20;

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function CameraRig() {
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;

  const s = useMemo(
    () => ({
      seenNonce: -1,
      preset: 'range' as PresetId,
      transition: null as null | { t: number; dur: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; fromFov: number },
      userActive: false,
      dragging: false,
      lastInteraction: 0,
      anchor: null as number | null,
      goal: { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45 } as Shot,
      directed: '' as PresetId | '',
      firstDecision: true,
      returning: false,
    }),
    [],
  );

  // Place the camera at the initial shot immediately (no transition from the default position).
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    resolveShot(getCameraState().preset, s.goal);
    cam.position.copy(s.goal.pos);
    c.target.copy(s.goal.target);
    cam.fov = s.goal.fov;
    cam.updateProjectionMatrix();
    c.update();
    s.seenNonce = getCameraState().nonce;
    s.preset = getCameraState().preset;

    const onStart = () => {
      s.dragging = true;
      s.userActive = true;
      s.transition = null;
      s.returning = false;
      s.anchor = followAnchor(s.preset);
      s.lastInteraction = performance.now();
    };
    const onEnd = () => {
      s.dragging = false;
      s.lastInteraction = performance.now();
    };
    c.addEventListener('start', onStart);
    c.addEventListener('end', onEnd);
    return () => {
      c.removeEventListener('start', onStart);
      c.removeEventListener('end', onEnd);
    };
  }, [cam, s]);

  const beginTransition = (dur: number) => {
    s.transition = { t: 0, dur, fromPos: cam.position.clone(), fromTarget: controls.current!.target.clone(), fromFov: cam.fov };
  };

  useFrame((_, dtRaw) => {
    const c = controls.current;
    if (!c) return;
    const dt = Math.min(dtRaw, 0.5); // wall-clock-ish even on a slow GPU: transitions must finish in time

    // follow height: smoothed so a reset becomes a swoop
    const [fy, fv] = smoothDamp(follow.y, vehicle.altScene, follow.vel, 0.9, dt);
    follow.y = fy;
    follow.vel = fv;

    // --- auto-director: pick the shot for the sequencer state, cut/ease when it changes ---
    const st = getCameraState();
    if (st.director) {
      const want = directedPreset(str('Launch/Clock/Phase'), num('Launch/Clock/TMinusSeconds'), bool('Launch/Vehicle/MECO'));
      if (want !== s.directed) {
        s.directed = want;
        if (want !== st.preset || s.firstDecision) selectPreset(want, s.firstDecision ? 'init' : 'director');
        s.firstDecision = false;
      }
    } else {
      s.directed = '';
    }

    // --- new selection -> transition ---
    const cur = getCameraState();
    if (cur.nonce !== s.seenNonce) {
      s.seenNonce = cur.nonce;
      s.preset = cur.preset;
      s.userActive = false;
      s.returning = false;
      s.anchor = null;
      if (motion.reduced || cur.source === 'init') s.transition = null;
      else beginTransition(TRANSITION_S);
      if (motion.reduced) s.transition = null;
    }

    resolveShot(s.preset, s.goal);
    const goal = s.goal;

    if (s.transition) {
      const tr = s.transition;
      tr.t += dt / tr.dur;
      const k = smootherstep(Math.min(1, tr.t));
      cam.position.lerpVectors(tr.fromPos, goal.pos, k);
      c.target.lerpVectors(tr.fromTarget, goal.target, k);
      cam.fov = tr.fromFov + (goal.fov - tr.fromFov) * k;
      cam.updateProjectionMatrix();
      if (tr.t >= 1) s.transition = null;
    } else if (s.userActive) {
      // The user is orbiting: keep their framing but ride along with a moving vehicle.
      const a = followAnchor(s.preset);
      if (a !== null) {
        if (s.anchor !== null) {
          const d = a - s.anchor;
          cam.position.y += d;
          c.target.y += d;
        }
        s.anchor = a;
      }
      const idle = (performance.now() - s.lastInteraction) / 1000;
      if (!s.dragging && !motion.reduced && idle > IDLE_RETURN_S) {
        s.userActive = false;
        beginTransition(TRANSITION_S);
      }
    } else {
      cam.position.copy(goal.pos);
      c.target.copy(goal.target);
      if (Math.abs(cam.fov - goal.fov) > 0.01) {
        cam.fov = goal.fov;
        cam.updateProjectionMatrix();
      }
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      panSpeed={0.7}
      minDistance={6}
      maxDistance={2200}
      maxPolarAngle={Math.PI * 0.97}
    />
  );
}
