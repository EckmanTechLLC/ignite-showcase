<script lang="ts">
  import { ui } from '../ui.svelte';
</script>

<div class="toasts mono" aria-live="polite">
  {#each ui.toasts as t (t.id)}<div class="toast {t.tone}">{t.text}</div>{/each}
</div>

<style>
  .toasts { position: fixed; z-index: 45; left: 50%; bottom: var(--space-4); transform: translateX(-50%); display: grid; gap: 6px; justify-items: center; pointer-events: none; }
  .toast { padding: 6px 14px; background: var(--bg-2); border: 1px solid var(--line-strong); border-left-width: 4px; border-radius: var(--radius-2); color: var(--fg-0); font-size: var(--text-sm); box-shadow: 0 6px 20px rgb(0 0 0 / 0.5); }
  .toast.ok { border-left-color: var(--ok); }
  .toast.warn { border-left-color: var(--warn); }
  .toast.alarm { border-left-color: var(--alarm); }
  .toast.info { border-left-color: var(--info); }
</style>
