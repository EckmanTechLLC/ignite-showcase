import { onCleanup, onMount } from 'solid-js';
import Hud from './hud/Hud';
import BatchStrip from './strip/BatchStrip';
import OeeTile from './strip/OeeTile';
import Plant, { scene } from './plant/Plant';
import Tooltip from './detail';
import Help from './Help';
import PerfReadout from './PerfReadout';
import { startLive, stopLive } from './live/store';
import { startIdentity } from './identity';
import { clearSelection, sel } from './selection';
import { help, setHelp } from './ui';

export default function App() {
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === '?') setHelp(!help());
    else if (k === 'Escape') {
      if (help()) setHelp(false);
      else if (sel()) clearSelection();
    } else if (k.toLowerCase() === 'r') scene()?.resetCamera();
  };
  onMount(() => {
    startLive();
    startIdentity();
    window.addEventListener('keydown', onKey);
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKey);
    stopLive();
  });
  return (
    <>
      <Hud />
      <BatchStrip />
      <Plant />
      <OeeTile />
      <Tooltip />
      <Help />
      <PerfReadout />
    </>
  );
}
