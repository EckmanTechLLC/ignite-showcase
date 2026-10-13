<script lang="ts">
  import { onMount } from 'svelte';
  import { onFrameTime } from './anim.svelte';
  import { stats } from './live/store.svelte';

  // Readout: always available in dev; in a build it is enabled by ?perf (shown at once). "p" toggles.
  const enabled = import.meta.env.DEV || new URLSearchParams(location.search).has('perf');
  let open = $state(new URLSearchParams(location.search).has('perf'));
  let fps = $state(0);
  let avg = $state(0);
  let p50 = $state(0);
  let p95 = $state(0);
  let max = $state(0);
  let nodes = $state(0);
  let batchesPerS = $state(0);
  let updatesPerS = $state(0);

  const WINDOW = 180;
  const frames: number[] = [];
  let lastB = 0;
  let lastU = 0;

  function sample(): void {
    if (!frames.length) return;
    const sorted = [...frames].sort((a, b) => a - b);
    const sum = frames.reduce((a, b) => a + b, 0);
    avg = sum / frames.length;
    fps = 1000 / avg;
    p50 = sorted[Math.floor(sorted.length * 0.5)];
    p95 = sorted[Math.floor(sorted.length * 0.95)];
    max = sorted[sorted.length - 1];
    nodes = document.getElementsByTagName('*').length;
    batchesPerS = stats.batches - lastB;
    updatesPerS = stats.updates - lastU;
    lastB = stats.batches;
    lastU = stats.updates;
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) open = !open;
  }
  onMount(() => {
    if (!enabled) return;
    window.addEventListener('keydown', onKey);
    const stopFrame = onFrameTime((ms) => {
      frames.push(ms);
      if (frames.length > WINDOW) frames.shift();
    });
    const timer = window.setInterval(sample, 1000);
    // Exposed for scripted measurement (headless runs).
    (window as unknown as { __perf: () => unknown }).__perf = () => ({ fps, avg, p50, p95, max, nodes, batchesPerS, updatesPerS });
    return () => {
      window.removeEventListener('keydown', onKey);
      stopFrame();
      clearInterval(timer);
    };
  });
</script>

{#if open}
  <div class="perf mono" aria-hidden="true">
    <div><b>{fps.toFixed(0)}</b> fps &middot; {avg.toFixed(1)} ms avg</div>
    <div>p50 {p50.toFixed(1)} ms &middot; p95 {p95.toFixed(1)} ms &middot; max {max.toFixed(1)} ms</div>
    <div>{nodes} DOM nodes</div>
    <div>{batchesPerS} batches/s &middot; {updatesPerS} updates/s</div>
  </div>
{/if}

<style>
  .perf { position: fixed; right: 12px; bottom: 12px; z-index: 30; padding: 8px 12px; background: rgb(0 0 0 / 0.82); border: 1px solid var(--accent); border-radius: var(--radius-2); font-size: var(--text-xs); color: var(--fg-1); pointer-events: none; }
  .perf b { color: var(--accent); font-size: var(--text-md); }
</style>
