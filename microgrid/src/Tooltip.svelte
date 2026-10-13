<script lang="ts">
  import { fade } from 'svelte/transition';
  import { detailFor } from './detail';
  import { sel } from './selection.svelte';
  import { motion } from './anim.svelte';

  // The array flyout already carries the per-inverter detail; the tooltip covers every other element.
  const d = $derived(sel.hover && sel.hover.kind !== 'pv' ? detailFor(sel.hover) : null);
  const style = $derived.by(() => {
    const left = sel.x > window.innerWidth - 280;
    const up = sel.y > window.innerHeight - 280;
    return `left:${left ? sel.x - 14 : sel.x + 16}px;top:${up ? sel.y - 12 : sel.y + 16}px;transform:translate(${left ? '-100%' : '0'},${up ? '-100%' : '0'})`;
  });
</script>

{#if d}
  <div class="tip mono" {style} role="tooltip" transition:fade={{ duration: motion.reduced ? 0 : 120 }}>
    <div class="h">{d.title}</div>
    <div class="s">{d.sub}</div>
    <dl>
      {#each d.rows as r (r.k)}
        <dt>{r.k}</dt>
        <dd class={r.tone}>{r.v}</dd>
      {/each}
    </dl>
  </div>
{/if}

<style>
  .tip { position: fixed; z-index: 20; min-width: 200px; padding: var(--space-3) var(--space-4); background: color-mix(in srgb, var(--bg-2) 94%, transparent); border: 1px solid var(--line-strong); border-radius: var(--radius-3); box-shadow: 0 8px 28px rgb(0 0 0 / 0.55); pointer-events: none; backdrop-filter: blur(6px); }
  .h { font-weight: 700; color: var(--accent); letter-spacing: 0.04em; text-transform: uppercase; font-size: var(--text-sm); }
  .s { color: var(--fg-2); font-size: var(--text-xs); margin-bottom: var(--space-2); }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-4); margin: 0; font-size: var(--text-sm); }
  dt { color: var(--fg-2); }
  dd { margin: 0; text-align: right; color: var(--fg-0); }
  dd.ok { color: var(--ok); } dd.warn { color: var(--warn); } dd.alarm { color: var(--alarm); }
</style>
