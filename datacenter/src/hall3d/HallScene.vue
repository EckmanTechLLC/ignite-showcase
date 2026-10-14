<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import * as THREE from 'three';
import { useLoop, useTres } from '@tresjs/core';
import { CameraControls } from '@tresjs/cientos';
import { reducedMotion } from '../anim';
import { selection } from '../selection';
import { boundsOf } from './geometry';
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
import { createAirflow } from './flow/airflow';
import { createShimmer } from './flow/shimmer';
import { hallPerf } from './perfStats';
import { disposeTree } from './util';

const { renderer, camera } = useTres();
const gl = renderer as THREE.WebGLRenderer;

const room = createRoom();
const racks = createRacks();
const crahs = createCrahs();
const electrical = createElectrical();
const roof = createRoof();
const labels = createLabels();
const power = createPower();
const airflow = createAirflow();
const shimmer = createShimmer();
const highlight = createHighlight();
const objects: THREE.Object3D[] = [room, racks.group, crahs.group, electrical.group, roof.group, labels, power.group, shimmer.group, airflow.points, highlight.group];
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
  racks.update();
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
  hallPerf.ready = false;
});


</script>

<template>
  <TresPerspectiveCamera :position="PRESETS[0].pos" :fov="42" :near="0.1" :far="220" />
  <CameraControls ref="controlsRef" make-default :min-distance="0.4" :max-distance="60" :max-polar-angle="1.62" :smooth-time="0.9" :dragging-smooth-time="0.12" />
  <TresHemisphereLight :args="['#9fb8d8', '#0b1018', 1.7]" />
  <TresDirectionalLight :position="[-8, 18, 10]" :intensity="1.7" />
  <TresDirectionalLight :position="[14, 8, -6]" :intensity="0.35" color="#6aa8ff" />
  <primitive v-for="o in objects" :key="o.uuid" :object="o" />
</template>
