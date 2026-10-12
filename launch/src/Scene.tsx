import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Mesh, MeshStandardMaterial } from 'three';

/** Placeholder pad and vehicle; the live tag drives the vehicle's glow via a ref, not React state. */
function Pad({ live }: { live: React.MutableRefObject<number | null> }) {
  const body = useRef<Mesh>(null);
  useFrame(() => {
    const m = body.current?.material as MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = 0.15 + 0.85 * Math.min(1, Math.abs(live.current ?? 0) / 100);
  });
  return (
    <group>
      <mesh position={[0, 0.25, 0]} receiveShadow castShadow>
        <boxGeometry args={[6, 0.5, 6]} />
        <meshStandardMaterial color="#2a3646" roughness={0.9} flatShading />
      </mesh>
      <mesh ref={body} position={[0, 3.5, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.6, 6, 12]} />
        <meshStandardMaterial color="#d9e2ee" emissive="#ff7a2f" emissiveIntensity={0.15} roughness={0.5} flatShading />
      </mesh>
      <mesh position={[0, 7.1, 0]} castShadow>
        <coneGeometry args={[0.6, 1.2, 12]} />
        <meshStandardMaterial color="#d9e2ee" roughness={0.5} flatShading />
      </mesh>
    </group>
  );
}

export function Scene({ live }: { live: React.MutableRefObject<number | null> }) {
  return (
    <Canvas shadows camera={{ position: [10, 6, 12], fov: 45 }} gl={{ antialias: true }}>
      <color attach="background" args={['#05080d']} />
      <fog attach="fog" args={['#05080d', 25, 60]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} castShadow />
      <pointLight position={[-4, 3, 4]} intensity={30} color="#ff7a2f" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#0c121b" roughness={1} />
      </mesh>
      <Pad live={live} />
      <OrbitControls target={[0, 3.5, 0]} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  );
}
