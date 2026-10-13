<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ui } from '../ui.svelte';

  let { title, hotkey, head, children }: { title: string; hotkey: string; head?: Snippet; children: Snippet } = $props();
</script>

<section class="panel mono" aria-label={title}>
  <header>
    <h2>{title} <kbd>{hotkey}</kbd></h2>
    <div class="extra">{@render head?.()}</div>
    <button class="x" aria-label="Close panel" onclick={() => (ui.panel = null)}>&times;</button>
  </header>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard-scrollable region) -->
  <div class="body" tabindex="0">{@render children()}</div>
</section>

<style>
  .panel {
    position: fixed; z-index: 20; right: 62px; top: calc(var(--hud-h) + var(--space-2)); bottom: var(--space-2);
    width: min(560px, calc(100vw - 82px)); display: flex; flex-direction: column;
    background: var(--bg-1); border: 1px solid var(--line-strong); border-radius: var(--radius-3);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.5); font-size: var(--text-sm); color: var(--fg-1);
  }
  header { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); white-space: nowrap; }
  kbd { font: 500 var(--text-xs) var(--font-mono); color: var(--fg-2); border: 1px solid var(--line-strong); border-radius: var(--radius-2); padding: 0 5px; margin-left: 6px; }
  .extra { flex: 1; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .x { background: none; border: 0; color: var(--fg-2); font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px; }
  .x:hover { color: var(--fg-0); }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-3); }
</style>
