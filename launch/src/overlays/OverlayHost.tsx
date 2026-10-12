import { lazy, Suspense, useEffect } from 'react';
import { AlarmBadge } from './alarms/AlarmBadge';
import { AlarmBoard } from './alarms/AlarmBoard';
import { startAlarms } from './alarms/store';
import { startStatusPolling } from './controls/api';
import { Controls } from './controls/Controls';
import { IdentityPanel } from './identity/IdentityPanel';
import { getSession, startSession, useSession } from './identity/session';
import { closeAllPanels, isOpen, togglePanel, usePanels, useToasts, type PanelId } from './ui';

// ECharts lives in this chunk; it loads the first time the panel opens.
const TelemetryPanel = lazy(() => import('./telemetry/TelemetryPanel'));
const Help = lazy(() => import('./Help'));

const KEYS: Record<string, PanelId> = { t: 'telemetry', a: 'alarms', c: 'controls', l: 'identity', '?': 'help' };

/** Slide-in panels, toasts, keyboard (T A C L, Esc closes) and pollers. Sits next to the HUD, not in the R3F tree. */
export function OverlayHost() {
  const open = usePanels();
  const toasts = useToasts();
  useEffect(() => {
    startSession();
    if (new URLSearchParams(window.location.search).has('about')) togglePanel('help', true);
    startAlarms();
    startStatusPolling(() => isOpen('controls') && getSession().canWrite);
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') return closeAllPanels();
      const id = KEYS[e.key.toLowerCase()];
      if (id) togglePanel(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <ToolDock />
      <aside className="ovl-stack" aria-label="Panels">
        {open.has('help') && (
          <Suspense fallback={null}>
            <Help />
          </Suspense>
        )}
        {open.has('identity') && <IdentityPanel />}
        {open.has('controls') && <Controls />}
        {open.has('alarms') && <AlarmBoard />}
        {open.has('telemetry') && (
          <Suspense fallback={<section className="ovl wide"><div className="ovl-b muted">Loading charts...</div></section>}>
            <TelemetryPanel />
          </Suspense>
        )}
      </aside>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

const TOOLS: { id: PanelId; key: string; label: string }[] = [
  { id: 'telemetry', key: 'T', label: 'Telemetry' },
  { id: 'alarms', key: 'A', label: 'Alarms' },
  { id: 'controls', key: 'C', label: 'Controls' },
  { id: 'help', key: '?', label: 'Help' },
];

/** Panel buttons (with the alarm badge) and the session chip. */
function ToolDock() {
  const open = usePanels();
  const s = useSession();
  return (
    <nav className="tools" aria-label="Panels">
      {TOOLS.map((t) => (
        <button key={t.id} type="button" className={open.has(t.id) ? 'active' : ''} onClick={() => togglePanel(t.id)} title={`${t.label} (${t.key})`} aria-pressed={open.has(t.id)}>
          <kbd>{t.key}</kbd>
          <span>{t.label}</span>
          {t.id === 'alarms' && <AlarmBadge />}
        </button>
      ))}
      <button type="button" className={`who-chip ${open.has('identity') ? 'active' : ''}`} onClick={() => togglePanel('identity')} title="Identity (L)" aria-pressed={open.has('identity')}>
        <kbd>L</kbd>
        <span>{s.loggedIn ? s.user : 'Log in'}</span>
        <i className={`tier tier-${s.tier}`}>{s.tier}</i>
      </button>
    </nav>
  );
}
