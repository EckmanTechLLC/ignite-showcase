<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import * as THREE from 'three';
import { useLoop, useTres } from '@tresjs/core';
import { CameraControls } from '@tresjs/cientos';
import { reducedMotion } from '../anim';
import { selection } from '../selection';
import { WALL_H, boundsOf } from './geometry';
import { createCameraRig, type CameraRig } from './camera';
import { PRESETS, presetRequest } from './presets';
import { createInteraction, type Interaction } from './interact';
import { createHighlight } from './highlight';
import { createRoom } from './buildRoom';
import { createRacks } from './racks';
import { createCrahs } from './crahs';
import { createElectrical } from './electrical';
import { createRoof } from './roof';
import { createLabels } from './labels';
import { createPower } from './flow/power';
import { createExhaust } from './flow/exhaust';
import { createDisplays } from './displays';
import { createEnvironment, createMaterials, clock } from './materials';
import { createAirflow } from './flow/airflow';
import { createShimmer } from './flow/shimmer';
import { hallPerf } from './perfStats';
import { disposeTree } from './util';

const { renderer, camera, scene } = useTres();
const gl = renderer as THREE.WebGLRenderer;
const threeScene = ((scene as unknown as { value?: THREE.Scene }).value ?? scene) as THREE.Scene;

// Lighting: image-based light from a procedural room, one shadowed key light (static casters, so the shadow map is
// rendered a few times at start and then left alone), a soft ceiling spot over the electrical room and a light fog.
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFShadowMap;
gl.shadowMap.autoUpdate = false;
const env = createEnvironment(gl);
threeScene.environment = env;
threeScene.environmentIntensity = 0.5;
threeScene.fog = new THREE.FogExp2('#05080d', 0.011);
const key = new THREE.DirectionalLight('#fff2e0', 1.6);
key.position.set(-3, 24, 20);
key.target.position.set(4, 0, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 5, far: 60 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
const rim = new THREE.DirectionalLight('#6aa8ff', 0.5);
rim.position.set(16, 9, -8);
const spot = new THREE.SpotLight('#ffe9c8', 60, 22, 1.0, 0.7, 1.5);
spot.position.set(-3.8, 3.3, 8.2);
spot.target.position.set(-3.8, 0, 8.2);
const lights = new THREE.Group();
lights.add(key, key.target, rim, spot, spot.target);

const mats = createMaterials();
const room = createRoom(mats);
const racks = createRacks(mats);
const crahs = createCrahs(mats);
const electrical = createElectrical(mats);
const roof = createRoof(mats);
const displays = createDisplays(mats);
const exhaust = createExhaust(electrical.stackTop);
const labels = createLabels();
const power = createPower(mats);
const airflow = createAirflow();
const shimmer = createShimmer();
const highlight = createHighlight();
const objects: THREE.Object3D[] = [room, racks.group, crahs.group, electrical.group, roof.group, displays.group, labels, power.group, exhaust.group, shimmer.group, airflow.points, highlight.group, lights];
[room, racks.group, crahs.group, electrical.group, roof.group, power.group].forEach((g) => g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).receiveShadow = true) : undefined)));
let shadowFrames = 0;
const ceiling = room.userData.ceiling as THREE.Object3D | undefined;
const ductMat = room.userData.ductMat as THREE.MeshStandardMaterial;
hallPerf.particles = 0;

// Reduced motion: no particles, no spin, static camera (the rest of the scene still follows live data).
airflow.points.visible = !reducedMotion.value;
watch(reducedMotion, (r) => (airflow.points.visible = !r));

const controlsRef = ref<{ instance: unknown } | null>(null);
let rig: CameraRig | null = null;
let interaction: Interaction | null = null;
const size = new THREE.Vector2();
watch(presetRequest, (r) => r && rig?.go(r.i));

function setup(): void {
  const ctrl = (controlsRef.value?.instance ?? null) as import('@tresjs/cientos').BaseCameraControls | null;
  const cam = camera.value;
  if (!ctrl || !cam || rig) return;
  rig = createCameraRig(ctrl, cam, () => reducedMotion.value);
  void ctrl.setLookAt(...PRESETS[0].pos, ...PRESETS[0].target, false);
  interaction = createInteraction(
    gl.domElement,
    () => camera.value,
    [
      { mesh: racks.pick, target: (i) => ({ kind: 'rack', id: `R${String(i + 1).padStart(2, '0')}` }) },
      { mesh: crahs.pick, target: (i) => ({ kind: 'crah', id: String(i + 1) }) },
      { mesh: electrical.pick, target: (i) => electrical.targetOf(i) },
      { mesh: roof.pick, target: (i) => ({ kind: 'chiller', id: String(i + 1) }) },
    ],
    (t) => {
      const b = boundsOf(t.kind, t.id);
      if (b) rig?.flyTo(b);
    },
  );
  window.addEventListener('keydown', onKey);
  // Dev only (stripped from builds): scripted camera placement for screenshots.
  if (import.meta.env.DEV) (window as unknown as { __hallLook: unknown }).__hallLook = (p: number[], t: number[]) => ctrl.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], false);
}

function onKey(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (e.key >= '1' && e.key <= '5') rig?.go(Number(e.key) - 1);
  else if (e.key === 'r' || e.key === 'R') rig?.reset();
  else if (e.key === 'Escape') selection.value = null;
}

const { onBeforeRender, onRender } = useLoop();
onBeforeRender(({ delta, elapsed }) => {
  setup();
  const dt = Math.min(delta, 0.1);
  const animate = !reducedMotion.value;
  gl.getDrawingBufferSize(size);
  clock.value = animate ? elapsed : 0;
  const above = (camera.value?.position.y ?? 0) >= WALL_H + 0.2;
  if (ceiling) ceiling.visible = !above;
  if (ductMat.transparent !== above) {
    ductMat.transparent = above;
    ductMat.opacity = above ? 0.1 : 1;
    ductMat.depthWrite = !above;
    ductMat.needsUpdate = true;
  }
  if (shadowFrames < 3) {
    gl.shadowMap.needsUpdate = true;
    shadowFrames++;
  }
  racks.update();
  displays.update(performance.now());
  exhaust.update(elapsed, animate, size.y);
  crahs.update(dt, animate);
  electrical.update(dt, elapsed, animate);
  roof.update(dt, animate);
  power.update(dt, elapsed, animate);
  airflow.update(dt, animate, size.y);
  shimmer.update(elapsed, animate);
  highlight.update();
  interaction?.update();
  rig?.update(dt, !!selection.value);
  hallPerf.particles = airflow.points.visible ? airflow.alive() : 0;
});
onRender(() => {
  hallPerf.ready = true;
  hallPerf.calls = gl.info.render.calls;
  hallPerf.triangles = gl.info.render.triangles;
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  interaction?.dispose();
  rig?.dispose();
  objects.forEach(disposeTree);
  env.dispose();
  hallPerf.ready = false;
});


</script>

<template>
  <TresPerspectiveCamera :position="PRESETS[0].pos" :fov="42" :near="0.1" :far="220" />
  <CameraControls ref="controlsRef" make-default :min-distance="0.4" :max-distance="60" :max-polar-angle="1.62" :smooth-time="0.9" :dragging-smooth-time="0.12" />
  <TresHemisphereLight :args="['#9fb8d8', '#0b1018', 0.45]" />
  <primitive v-for="o in objects" :key="o.uuid" :object="o" />
</template>
