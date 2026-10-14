<script lang="ts">
  import { onMount } from 'svelte';
  import PvFlyout from './PvFlyout.svelte';
  import { campus } from './handle.svelte';
  import { motion } from '../anim.svelte';
  import { sel, select } from '../selection.svelte';

  // Full-screen host for the Pixi canvas. Pixi is its own chunk, fetched after the HUD has painted.
  let host: HTMLDivElement;

  const edge = (sel_: string, side: 'right' | 'bottom'): number => {
    const el = document.querySelector(sel_);
    return el ? Math.round(el.getBoundingClientRect()[side]) : 0;
  };

  onMount(() => {
    let gone = false;
    let handle: { destroy: () => void } | null = null;
    const raf = requestAnimationFrame(() =>
      setTimeout(async () => {
        try {
          const { createScene } = await import('./scene');
          const h = await createScene(host, {
            onHover: (t, x, y) => {
              if (t) {
                sel.x = x;
                sel.y = y;
              }
              sel.hover = t;
            },
            onSelect: (t) => (t ? select(t) : (sel.target = null)),
            getSelection: () => sel.target,
            reduced: () => motion.reduced,
            insets: () => ({ left: edge('.rail', 'right') + 8, top: edge('.strip', 'bottom') + 4, right: 62, bottom: 6 }),
          });
          if (gone) h.destroy();
          else {
            handle = h;
            campus.handle = h;
            campus.state = 'ready';
          }
        } catch (e) {
          console.error('scene failed', e);
          campus.state = 'failed';
        }
      }, 0),
    );
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      handle?.destroy();
      campus.handle = null;
    };
  });
</script>

<div class="map" bind:this={host} data-state={campus.state} role="img" aria-label="Live campus map: PV fields, batteries, genset, EV lot, buildings and the utility substation, with the sun, shadows, clouds and power flows">
  {#if campus.state === 'loading'}<div class="note mono">Loading the campus&hellip;</div>{/if}
  {#if campus.state === 'failed'}<div class="note mono">The graphics renderer could not start (WebGL is unavailable). The numbers on the rails are still live.</div>{/if}
</div>
{#if sel.hover?.kind === 'pv'}<PvFlyout id={sel.hover.id} />{/if}

<style>
  .map { position: fixed; inset: 0; z-index: 0; }
  .note { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); color: var(--fg-2); font-size: var(--text-sm); text-align: center; max-width: 420px; }
</style>
