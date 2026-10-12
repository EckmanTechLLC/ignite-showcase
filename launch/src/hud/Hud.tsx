import { useEffect } from 'react';
import { PRESETS } from '../cameras/presets';
import { getCameraState, selectPreset, setDirector } from '../cameras/store';
import { TopBar } from './TopBar';
import { LeftRail } from './LeftRail';
import { BottomStrip } from './BottomStrip';
import { CameraDock } from './CameraDock';

/** HUD overlay: mission clock and status, go/no-go board, system strip, camera dock. Read-only except camera. */
export function Hud() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const preset = PRESETS.find((p) => p.key === e.key);
      if (preset) selectPreset(preset.id, 'user');
      else if (e.key === 'd' || e.key === 'D') setDirector(!getCameraState().director);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="hud">
      <TopBar />
      <LeftRail />
      <CameraDock />
      <BottomStrip />
      {import.meta.env.DEV && <pre id="perf" className="perf" />}
    </div>
  );
}
