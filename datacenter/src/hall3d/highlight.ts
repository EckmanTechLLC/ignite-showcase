import * as THREE from 'three';
import { boundsOf } from './geometry';
import { hover, selection, type Target } from '../selection';

/** Two wireframe boxes that follow the hovered and the selected item. */
export function createHighlight() {
  const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const mk = (color: string, opacity: number) => {
    const l = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, toneMapped: false }));
    l.visible = false;
    l.renderOrder = 10;
    l.frustumCulled = false;
    return l;
  };
  const hov = mk('#ffffff', 0.55);
  const sel = mk('#22d3ee', 1);
  const group = new THREE.Group();
  group.add(hov, sel);
  const place = (l: THREE.LineSegments, t: Target | null, pad: number) => {
    const b = t ? boundsOf(t.kind, t.id) : null;
    l.visible = !!b;
    if (b) {
      l.position.set(b.x, b.y, b.z);
      l.scale.set(b.sx + pad, b.sy + pad, b.sz + pad);
    }
  };
  return {
    group,
    update(): void {
      place(hov, hover.value, 0.04);
      place(sel, selection.value, 0.1);
    },
  };
}
