<script lang="ts">
  import { motion } from '../anim.svelte';

  // A conductor: an underlay that cuts crossings, a dim track, and dashes that travel along the path.
  // Dash speed (px/s) follows |kW| (the caller computes it); direction reverses the dashes; a dead path stops and dims.
  // One Web Animation per path; only its playbackRate follows the load, so a steady flow costs no per-frame work.
  let {
    d,
    color,
    speed,
    active,
    reverse = false,
    width = 3,
    dash = '7 11',
  }: { d: string; color: string; speed: number; active: boolean; reverse?: boolean; width?: number; dash?: string } = $props();

  let el: SVGPathElement | undefined = $state();
  const period = $derived(dash.split(/\s+/).reduce((a, b) => a + Number(b), 0));

  let anim: Animation | null = $state.raw(null);
  $effect(() => {
    if (!el?.animate) return;
    const a = el.animate(
      [{ strokeDashoffset: '0px' }, { strokeDashoffset: `${reverse ? period : -period}px` }],
      { duration: 1000, iterations: Infinity, easing: 'linear' },
    );
    a.pause();
    anim = a;
    return () => {
      a.cancel();
      anim = null;
    };
  });
  $effect(() => {
    const a = anim;
    if (!a) return;
    const rate = active && !motion.reduced && speed > 0.05 ? speed / period : 0;
    if (rate === 0) a.pause();
    else {
      a.updatePlaybackRate(rate);
      if (a.playState !== 'running') a.play();
    }
  });
</script>

<g class="flow" class:dead={!active}>
  <path {d} class="under" stroke-width={width + 5} />
  <path {d} class="track" stroke={active ? color : 'var(--line-strong)'} stroke-width={width} />
  <path bind:this={el} {d} class="dash" stroke={color} stroke-width={width} stroke-dasharray={dash} />
</g>

<style>
  path { fill: none; stroke-linejoin: round; }
  .under { stroke: var(--bg-1); }
  .track { opacity: 0.3; transition: stroke var(--dur-slow) var(--ease-out), opacity var(--dur-slow); }
  .dead .track { opacity: 0.5; stroke-dasharray: 3 6; }
  .dash { opacity: 0.95; transition: stroke 0.6s linear, opacity var(--dur-slow); }
  .dead .dash { opacity: 0; }
</style>
