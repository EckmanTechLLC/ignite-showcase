import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { stats } from './live/store';
import { perfEnabled, perfOpen, setPerfOpen } from './ui';
import { scene } from './plant/Plant';
import type { ScenePerf } from './plant/scene';

/** Readout: always available in dev; in a build it is enabled by ?perf (shown at once). "p" toggles. */
export default function PerfReadout() {
  const [p, setP] = createSignal<ScenePerf | null>(null);
  const [rate, setRate] = createSignal({ batches: 0, updates: 0 });
  let lastB = 0;
  let lastU = 0;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) setPerfOpen(!perfOpen());
  };
  onMount(() => {
    if (!perfEnabled) return;
    window.addEventListener('keydown', onKey);
    const timer = window.setInterval(() => {
      setP(scene()?.perf() ?? null);
      setRate({ batches: stats.batches - lastB, updates: stats.updates - lastU });
      lastB = stats.batches;
      lastU = stats.updates;
    }, 1000);
    // Exposed for scripted measurement (headless runs).
    (window as unknown as { __perf: () => unknown }).__perf = () => ({ ...(p() ?? {}), ...rate(), nodes: document.getElementsByTagName('*').length });
    onCleanup(() => {
      window.removeEventListener('keydown', onKey);
      clearInterval(timer);
    });
  });
  return (
    <Show when={perfEnabled && perfOpen()}>
      <div class="perf mono" aria-hidden="true">
        <Show when={p()} fallback={<div>waiting for the scene…</div>}>
          {(s) => (
            <>
              <div><b>{s().fps.toFixed(0)}</b> fps · {s().backend}</div>
              <div>frame p50 {s().p50.toFixed(1)} ms · p95 {s().p95.toFixed(1)} ms</div>
              <div>{s().drawCalls >= 0 ? `${s().drawCalls} draw calls` : 'draw calls n/a'} · {s().sprites} sprites · {s().objects} objects</div>
            </>
          )}
        </Show>
        <div>{rate().batches} SSE batches/s · {rate().updates} updates/s</div>
      </div>
    </Show>
  );
}
