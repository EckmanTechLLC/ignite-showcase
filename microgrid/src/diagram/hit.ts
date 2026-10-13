import { select, sel, type Target } from '../selection.svelte';

/** Svelte action: hover (tooltip target + pointer position), click / Enter / Space (selection), pointer cursor and a11y role. */
export function hit(node: SVGElement, t: Target) {
  let target = t;
  const enter = () => (sel.hover = target);
  const leave = () => (sel.hover = null);
  const move = (e: PointerEvent) => {
    sel.x = e.clientX;
    sel.y = e.clientY;
  };
  const click = (e: MouseEvent) => {
    e.stopPropagation();
    select(target);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(target);
    }
  };
  const focus = () => {
    const r = node.getBoundingClientRect();
    sel.x = r.right;
    sel.y = r.top;
    sel.hover = target;
  };
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.classList.add('hit');
  node.addEventListener('pointerenter', enter);
  node.addEventListener('pointerleave', leave);
  node.addEventListener('pointermove', move);
  node.addEventListener('click', click);
  node.addEventListener('keydown', key);
  node.addEventListener('focus', focus);
  node.addEventListener('blur', leave);
  return {
    update(next: Target) {
      target = next;
    },
    destroy() {
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointerleave', leave);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('click', click);
      node.removeEventListener('keydown', key);
      node.removeEventListener('focus', focus);
      node.removeEventListener('blur', leave);
    },
  };
}
