import type { SceneHandle } from './scene';

/** The running scene (null until the lazy Pixi chunk has loaded): keyboard reset and the perf readout reach it here. */
export const campus = $state<{ handle: SceneHandle | null; state: 'loading' | 'ready' | 'failed' }>({ handle: null, state: 'loading' });
