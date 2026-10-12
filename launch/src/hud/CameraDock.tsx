import { useSyncExternalStore } from 'react';
import { PRESETS } from '../cameras/presets';
import { getCameraState, selectPreset, setDirector, subscribeCamera } from '../cameras/store';
import { motion } from '../motion';

/** Camera presets (keys 1-6) and the auto-director toggle (D). The only interactive HUD element. */
export function CameraDock() {
  const cam = useSyncExternalStore(subscribeCamera, getCameraState);
  return (
    <nav className="dock" aria-label="Camera presets">
      {PRESETS.filter((p) => p.key).map((p) => (
        <button
          key={p.id}
          type="button"
          className={cam.preset === p.id || (p.id === 'pad' && cam.preset === 'padLow') ? 'active' : ''}
          onClick={() => selectPreset(p.id, 'user')}
          title={`${p.label} (${p.key})`}
        >
          <kbd>{p.key}</kbd>
          <span>{p.label}</span>
        </button>
      ))}
      <button type="button" className={`auto ${cam.director ? 'active' : ''}`} onClick={() => setDirector(!cam.director)} disabled={motion.reduced} title="Auto-director (D)">
        <kbd>D</kbd>
        <span>Auto</span>
      </button>
    </nav>
  );
}
