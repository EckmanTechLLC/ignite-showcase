import { useEffect } from 'react';
import { Hud } from './hud/Hud';
import { OverlayHost } from './overlays/OverlayHost';
import { Scene } from './Scene';
import { __seed, startLive } from './live/store';

export function App() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      // Dev only: ?live=0 skips the gateway and window.__seed({...}) sets tag values by hand, which makes
      // every scene state reproducible without waiting for the sequencer.
      (window as unknown as { __seed: typeof __seed }).__seed = __seed;
      if (new URLSearchParams(window.location.search).get('live') === '0') return;
    }
    startLive();
  }, []);
  return (
    <>
      <div className="stage">
        <Scene />
      </div>
      <Hud />
      <OverlayHost />
    </>
  );
}
