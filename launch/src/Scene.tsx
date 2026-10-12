import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { World } from './world/World';
import { CameraRig } from './cameras/CameraRig';
import { PerfProbe } from './hud/PerfProbe';
import { motion } from './motion';

/** Full-viewport R3F canvas: the world, the camera rig and the post-processing chain. */
const LOW = new URLSearchParams(window.location.search).get('q') === 'low';
const BASE_DPR = LOW ? 0.8 : Math.min(window.devicePixelRatio || 1, 1.25);

export function Scene() {
  // Render-resolution scale. Changes only when PerformanceMonitor decides the GPU is struggling
  // (a rare event, never per frame), so React state is appropriate here. Starts at 1 on standard
  // displays and at 1.25 on high-density ones; ?q=low starts lower and drops bloom and shadows.
  const [dpr, setDpr] = useState(BASE_DPR);
  return (
    <Canvas
      className="canvas"
      dpr={dpr}
      shadows={LOW ? false : 'percentage'}
      camera={{ position: [255, 82, 335], fov: 44, near: 0.8, far: 24000 }}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping, stencil: false }}
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setDpr((d) => Math.max(0.75, d - 0.25))}
        onIncline={() => setDpr((d) => Math.min(BASE_DPR, d + 0.25))}
      />
      <Suspense fallback={null}>
        <World />
      </Suspense>
      <CameraRig />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur levels={LOW ? 3 : 7} intensity={motion.reduced ? 0.6 : 0.85} luminanceThreshold={0.9} luminanceSmoothing={0.25} radius={0.7} />
        <Vignette eskil={false} offset={0.28} darkness={0.55} blendFunction={BlendFunction.NORMAL} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
      </EffectComposer>
      <PerfProbe />
    </Canvas>
  );
}
