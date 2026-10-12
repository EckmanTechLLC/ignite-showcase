import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/**
 * Dev-only performance readout (toggle with the P key): smoothed frame time, fps, draw calls and
 * triangles summed over every pass of the frame (post-processing renders several). Writes straight to a
 * DOM node; compiled out of production builds.
 */
export function PerfProbe() {
  if (!import.meta.env.DEV) return null;
  return <Probe />;
}

function Probe() {
  const gl = useThree((s) => s.gl);
  const m = useRef({ ema: 16.7, worst: 0, acc: 0, frames: 0, calls: 0, tris: 0, t0: 0, cpu: 0, cpuEma: 0 }).current;

  useEffect(() => {
    gl.info.autoReset = false;
    const onKey = (e: KeyboardEvent) => {
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
    m.ema += (ms - m.ema) * 0.05;
    m.worst = Math.max(m.worst, ms);
    m.acc += dt;
    m.frames++;
    if (m.acc < 0.5) return;
    const el = document.getElementById('perf');
    if (el && el.classList.contains('on')) {
      el.textContent = `${m.ema.toFixed(1)} ms  ${(m.frames / m.acc).toFixed(0)} fps  worst ${m.worst.toFixed(0)} ms  js ${m.cpuEma.toFixed(2)} ms\ncalls ${m.calls}  tris ${(m.tris / 1000).toFixed(0)}k  geo ${gl.info.memory.geometries}  tex ${gl.info.memory.textures}`;
    }
    (window as unknown as { __perf?: unknown }).__perf = { ms: m.ema, fps: m.frames / m.acc, worst: m.worst, jsMs: m.cpuEma, calls: m.calls, triangles: m.tris };
    m.acc = 0;
    m.frames = 0;
    m.worst = 0;
  }, -1000);
  // Last priority-0 callback of the frame (mounted last): JS time spent updating the scene, GPU excluded.
  useFrame(() => {
    m.cpu = performance.now() - m.t0;
    m.cpuEma += (m.cpu - m.cpuEma) * 0.05;
  });
  return null;
}
