<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { motion } from '../anim.svelte';
  import { num } from '../fmt';

  // A number that rolls to its new value instead of jumping (the sim steps once a second at 120x).
  let { value, digits = 0, prefix = '' }: { value: number; digits?: number; prefix?: string } = $props();
  const tw = new Tween(0, { duration: 900, easing: cubicOut });
  let first = true;
  $effect(() => {
    if (!Number.isFinite(value)) return;
    if (first || motion.reduced) {
      first = false;
      void tw.set(value, { duration: 0 });
    } else tw.target = value;
  });
</script>

{#if Number.isFinite(value)}{tw.current < 0 && Number(num(tw.current, digits)) !== 0 ? '\u2212' : ''}{prefix}{num(Math.abs(tw.current), digits)}{:else}&mdash;{/if}
