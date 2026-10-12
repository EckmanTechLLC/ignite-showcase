import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { stats } from '../live/store';

/** Readout is available in dev builds and, in production, when the URL carries ?perf. */
export const PERF_ENABLED = import.meta.env.DEV || new URLSearchParams(window.location.search).has('perf');
/** ?perf shows it straight away; in dev it starts hidden (P toggles). */
export const PERF_START_OPEN = new URLSearchParams(window.location.search).has('perf');

const WINDOW = 180;

/**
 * Performance readout (?perf in a build, always available in dev; P toggles): fps, frame time p50/p95/max over the
 * last 180 frames, JS time per frame, draw calls and triangles summed over every pass of the frame (post-processing
 * renders several), SSE batches per second. Writes straight to a DOM node.
 */
export function PerfProbe() {
  if (!PERF_ENABLED) return null;
  return <Probe />;
}

function Probe() {
  const gl = useThree((s) => s.gl);
  const m = useRef({ frames: [] as number[], acc: 0, n: 0, calls: 0, tris: 0, t0: 0, cpu: 0, cpuEma: 0, b: 0, u: 0 }).current;

  useEffect(() => {
    gl.info.autoReset = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'p' || e.key === 'P') document.getElementById('perf')?.classList.toggle('on');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      gl.info.autoReset = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [gl]);

  // First callback of the frame: read the totals of the previous frame, then reset the counters.
  useFrame((_, dt) => {
    m.calls = gl.info.render.calls;
    m.tris = gl.info.render.triangles;
    gl.info.reset();
    m.t0 = performance.now();
    const ms = dt * 1000;
    m.frames.push(ms);
    if (m.frames.length > WINDOW) m.frames.shift();
    m.acc += dt;
    m.n++;
    if (m.acc < 1) return;
    const sorted = [...m.frames].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const max = sorted[sorted.length - 1];
    const fps = m.n / m.acc;
    const batches = stats.batches - m.b;
    const updates = stats.updates - m.u;
    m.b = stats.batches;
    m.u = stats.updates;
    const el = document.getElementById('perf');
    if (el && el.classList.contains('on')) {
      el.textContent = `${fps.toFixed(0)} fps  p50 ${p50.toFixed(1)} ms  p95 ${p95.toFixed(1)} ms  max ${max.toFixed(0)} ms\njs ${m.cpuEma.toFixed(2)} ms  calls ${m.calls}  tris ${(m.tris / 1000).toFixed(0)}k  geo ${gl.info.memory.geometries}  tex ${gl.info.memory.textures}\n${batches} batches/s  ${updates} updates/s  dpr ${gl.getPixelRatio().toFixed(2)}`;
    }
    (window as unknown as { __perf?: unknown }).__perf = { fps, p50, p95, max, jsMs: m.cpuEma, calls: m.calls, triangles: m.tris, batchesPerS: batches, updatesPerS: updates, dpr: gl.getPixelRatio() };
    m.acc = 0;
    m.n = 0;
  }, -1000);
  // Last priority-0 callback of the frame (mounted last): JS time spent updating the scene, GPU excluded.
  useFrame(() => {
    m.cpu = performance.now() - m.t0;
    m.cpuEma += (m.cpu - m.cpuEma) * 0.05;
  });
  return null;
}
