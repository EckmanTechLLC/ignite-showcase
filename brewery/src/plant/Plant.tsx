import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { reduced } from '../motion';
import { clearSelection, setHover, setSel, sel } from '../selection';
import type { SceneHandle, ScenePerf } from './scene';

/** The scene handle for keyboard shortcuts and the perf readout; null until Pixi has loaded. */
export const [scene, setScene] = createSignal<SceneHandle | null>(null);
export const scenePerf = (): ScenePerf | null => scene()?.perf() ?? null;

/** Full-area host for the Pixi canvas. Pixi is a separate chunk, loaded after the page shell has painted. */
export default function Plant() {
  let host!: HTMLDivElement;
  const [state, setState] = createSignal<'loading' | 'ready' | 'failed'>('loading');
  let handle: SceneHandle | null = null;
  let gone = false;

  onMount(() => {
    // Let the HTML shell and the HUD paint first, then fetch the renderer chunk.
    requestAnimationFrame(() =>
      setTimeout(async () => {
        try {
          const { createScene } = await import('./scene');
          const h = await createScene(host, {
            onHover: setHover,
            onSelect: (s) => (s ? setSel(s) : clearSelection()),
            getSelection: sel,
            reduced,
          });
          if (gone) h.destroy();
          else {
            handle = h;
            setScene(h);
            setState('ready');
          }
        } catch (e) {
          console.error('scene failed', e);
          setState('failed');
        }
      }, 0),
    );
  });
  onCleanup(() => {
    gone = true;
    handle?.destroy();
    setScene(null);
  });

  return (
    <div class="stage" ref={host} data-state={state()} role="img" aria-label="Live isometric brewery plant: brewhouse, fermenters, bright tanks, packaging line and utilities">
      <Show when={state() === 'loading'}>
        <div class="stage-note mono">Loading the plant…</div>
      </Show>
      <Show when={state() === 'failed'}>
        <div class="stage-note mono">The graphics renderer could not start (WebGL is unavailable). The numbers above are still live.</div>
      </Show>
    </div>
  );
}
