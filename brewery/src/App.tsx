import { Match, Switch, createEffect, lazy, on, onCleanup, onMount } from 'solid-js';
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
import { closePanel, help, panel, setHelp, setPanel, togglePanel, type PanelKey } from './ui';
import Dock from './overlays/Dock';
import Toasts from './overlays/Toasts';
import { startAlarms } from './overlays/alarms/store';

// Panels load with the first open (ECharts stays out of the entry chunk).
const BatchPanel = lazy(() => import('./overlays/batch/BatchPanel'));
const Trends = lazy(() => import('./overlays/trends/Trends'));
const AlarmBoard = lazy(() => import('./overlays/alarms/AlarmBoard'));
const Controls = lazy(() => import('./overlays/controls/Controls'));
const Identity = lazy(() => import('./overlays/identity/Identity'));

const HOTKEYS: Record<string, PanelKey> = { b: 'batch', t: 'trends', a: 'alarms', c: 'controls', l: 'identity' };

export default function App() {
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
      if (k === 'Escape') e.target.blur();
      return;
    }
    if (k === '?') setHelp(!help());
    else if (k === 'Escape') {
      if (help()) setHelp(false);
      else if (sel()) clearSelection();
      else closePanel();
    } else if (k.toLowerCase() === 'r') scene()?.resetCamera();
    else if (HOTKEYS[k.toLowerCase()]) togglePanel(HOTKEYS[k.toLowerCase()]);
  };
  // Selecting something in the plant opens the overlay that explains it: a batch bar the Batch panel, anything else Trends.
  createEffect(
    on(sel, (s) => {
      if (!s) return;
      if (s.kind === 'batch') setPanel('batch');
      else if (panel() !== 'batch') setPanel('trends');
    }, { defer: true }),
  );
  onMount(() => {
    startLive();
    startIdentity();
    startAlarms();
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
      <Dock />
      <Switch>
        <Match when={panel() === 'batch'}><BatchPanel /></Match>
        <Match when={panel() === 'trends'}><Trends /></Match>
        <Match when={panel() === 'alarms'}><AlarmBoard /></Match>
        <Match when={panel() === 'controls'}><Controls /></Match>
        <Match when={panel() === 'identity'}><Identity /></Match>
      </Switch>
      <Toasts />
      <Help />
      <PerfReadout />
    </>
  );
}
