import * as THREE from 'three';
import { hover, pointer, select, selection, same, type Target } from '../selection';

export interface Pickable {
  mesh: THREE.InstancedMesh;
  /** Map an instance index to a selection target. */
  target(instance: number): Target;
}

export interface Interaction {
  /** Run once per frame: resolves the pending hover raycast. */
  update(): void;
  dispose(): void;
}

/**
 * Raycast hover and click-to-select against the instanced equipment. Hover writes the existing hover/pointer stores
 * (the DOM tooltip follows the pointer), click writes the selection store (the overlays react to it).
 */
export function createInteraction(canvas: HTMLElement, camera: () => THREE.Camera | undefined, pickables: Pickable[], onSelect: (t: Target) => void): Interaction {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const meshes = pickables.map((p) => p.mesh);
  let pending: { x: number; y: number } | null = null;
  let down: { x: number; y: number; t: number } | null = null;

  function hit(clientX: number, clientY: number): Target | null {
    const cam = camera();
    if (!cam) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const h = ray.intersectObjects(meshes, false)[0];
    if (!h || h.instanceId === undefined) return null;
    const p = pickables.find((x) => x.mesh === h.object);
    return p ? p.target(h.instanceId) : null;
  }

  const onMove = (e: PointerEvent) => {
    pointer.value = { x: e.clientX, y: e.clientY };
    if (e.buttons === 0) pending = { x: e.clientX, y: e.clientY };
    else if (hover.value) hover.value = null;
  };
  const onLeave = () => {
    pending = null;
    hover.value = null;
  };
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    hover.value = null;
  };
  const onUp = (e: PointerEvent) => {
    const d = down;
    down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 700) return;
    const t = hit(e.clientX, e.clientY);
    if (!t) {
      selection.value = null;
      return;
    }
    const wasSelected = same(selection.value, t);
    select(t);
    if (!wasSelected) onSelect(t);
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  return {
    update() {
      if (!pending) return;
      const p = pending;
      pending = null;
      const t = hit(p.x, p.y);
      if (!t) {
        if (hover.value) hover.value = null;
      } else if (!same(hover.value, t)) hover.value = t;
      canvas.style.cursor = t ? 'pointer' : '';
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      hover.value = null;
    },
  };
}
