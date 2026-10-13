import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import Panel from '../Panel';
import QaButtons from './Qa';
import { adminBlock, canAdmin, canWrite, writeBlock } from '../../identity';
import { tagBool, tagNum, tagStr } from '../../live/store';
import { BBTS, FVS, RECIPES, SLOTS, INACTIVE_STATES } from '../../model';
import { num, pretty } from '../../fmt';
import { busy, refreshStatus, run, status } from './brew';

const SCENARIOS = ['normal', 'glycol_failure', 'filler_jam', 'stuck_sparge', 'boil_over', 'contamination', 'rush_order'] as const;
/** brew.inject_fault names -> the _Sim_/Fault/ tag that shows them. */
export const FAULTS: Record<string, string> = {
  glycol_failure: 'GlycolFailure', filler_jam: 'FillerJam', seamer_fault: 'SeamerFault', label_out: 'LabelOut', stuck_sparge: 'StuckSparge',
  boil_over: 'BoilOver', contamination: 'Contamination', co2_leak: 'Co2Leak', air_loss: 'AirLoss', boiler_low: 'BoilerLow', cip_dosing: 'CipDosing',
};
const SPEEDS = [30, 60, 120, 240] as const;
const ACCELS = [4, 8, 16] as const;

export default function Controls() {
  const scenario = () => tagStr('_Sim_/Scenario');
  const speed = () => tagNum('_Sim_/SpeedFactor');
  const accel = () => tagNum('_Sim_/FermentAccel');
  const held = () => tagBool('_Sim_/Request/HoldLine');
  const lineState = () => tagStr('Packaging/Line/State');
  const lineFormat = () => tagStr('Packaging/Line/Format');
  const lineIdle = () => lineState() === 'IDLE' && !tagStr('Packaging/Line/BatchId');
  const faulted = () => Object.entries(FAULTS).filter(([, t]) => tagBool(`_Sim_/Fault/${t}`)).map(([n]) => n);

  const [recipe, setRecipe] = createSignal<string>(RECIPES[0]);
  const [fmt, setFmt] = createSignal<'CAN' | 'KEG'>('KEG');
  const [cipUnit, setCipUnit] = createSignal('FV01');
  const [clearName, setClearName] = createSignal('');
  const [injectName, setInjectName] = createSignal('filler_jam');
  const [bpd, setBpd] = createSignal(2);
  const [queue, setQueue] = createSignal('');
  const [qaBatch, setQaBatch] = createSignal('');
  const queueText = () => (queue() || tagStr('Schedule/Queue')).trim();

  const batches = () => SLOTS.map((s) => ({ id: tagStr(`Batches/${s}/Id`), state: tagStr(`Batches/${s}/State`), qa: tagStr(`Batches/${s}/QAStatus`) })).filter((b) => b.id && !INACTIVE_STATES.has(b.state));

  const wb = () => writeBlock();
  const ab = () => adminBlock();
  const off = () => !canWrite() || busy();

  createEffect(() => {
    if (!canWrite()) return;
    void refreshStatus();
    const id = window.setInterval(() => !document.hidden && void refreshStatus(), 10_000);
    onCleanup(() => clearInterval(id));
  });

  const queueValid = () => {
    const l = queueText().split(',').map((x) => x.trim()).filter(Boolean);
    return l.length > 0 && l.every((x) => (RECIPES as readonly string[]).includes(x));
  };

  return (
    <Panel
      title="Controls"
      hotkey="C"
      head={
        <>
          <span class="chip">{scenario() || '—'}</span>
          <span class="chip">{Number.isFinite(speed()) ? `${speed()}×` : '—'}</span>
        </>
      }
    >
      <Show when={wb()}>
        <p class="warn" role="status">{wb()}. The state below is live; the controls need the Operator tier.</p>
      </Show>
      <Show when={status()?.last_error}>
        <p class="warn">Sim reports: {status()!.last_error}</p>
      </Show>

      <h3>Operator <small>{canWrite() ? '' : wb()}</small></h3>

      <section class="cs">
        <h4>Start batch <small>as soon as the mill and mash tun are free{status()?.pending.start_batch ? ` · waiting: ${status()!.pending.start_batch}` : ''}</small></h4>
        <div class="line">
          <select onChange={(e) => setRecipe(e.currentTarget.value)} disabled={off()} aria-label="Recipe">
            <For each={RECIPES}>{(r) => <option value={r} selected={recipe() === r}>{r}</option>}</For>
          </select>
          <button class="b" disabled={off()} title={wb() || `Brew ${recipe()}`} onClick={() => void run('start_batch', [recipe()])}>Start batch</button>
        </div>
      </section>

      <section class="cs">
        <h4>Packaging line</h4>
        <div class="line">
          <span class="state" classList={{ bad: lineState() === 'DOWN' }}>{held() ? 'HELD' : pretty(lineState())}</span>
          <button class="b" disabled={off() || held()} title={wb() || 'Stop the line; it keeps its batch'} onClick={() => void run('hold_line')}>Hold line</button>
          <button class="b" disabled={off() || !held()} title={wb() || (held() ? 'Release the line' : 'The line is not held')} onClick={() => void run('resume_line')}>Resume line</button>
        </div>
        <div class="line">
          <span class="state">{lineFormat() || '—'}</span>
          <div class="seg">
            <For each={['CAN', 'KEG'] as const}>
              {(f) => (
                <button classList={{ on: fmt() === f }} disabled={off()} onClick={() => setFmt(f)}>{f}</button>
              )}
            </For>
          </div>
          <button class="b" disabled={off() || !lineIdle() || lineFormat() === fmt()} title={wb() || (!lineIdle() ? 'Needs an idle line with no batch' : lineFormat() === fmt() ? `Already on ${fmt()}` : `Change over to ${fmt()} (45 s)`)} onClick={() => void run('changeover', [fmt()])}>
            Changeover to {fmt()}
          </button>
        </div>
      </section>

      <section class="cs">
        <h4>CIP <small>an empty tank, or the line</small></h4>
        <div class="line">
          <select onChange={(e) => setCipUnit(e.currentTarget.value)} disabled={off()} aria-label="CIP unit">
            <For each={[...FVS, ...BBTS, 'LINE']}>{(u) => <option value={u} selected={cipUnit() === u}>{u}</option>}</For>
          </select>
          <button class="b" disabled={off()} title={wb() || `Queue a CIP for ${cipUnit()}`} onClick={() => void run('cip', [cipUnit()])}>Start CIP</button>
          <span class="note">now: {tagStr('Utilities/CIP/Step') ? `${pretty(tagStr('Utilities/CIP/Step'))} ${tagStr('Utilities/CIP/TargetUnit')}` : 'idle'}</span>
        </div>
      </section>

      <section class="cs">
        <h4>Faults</h4>
        <div class="line">
          <select onChange={(e) => setClearName(e.currentTarget.value)} disabled={off() || !faulted().length} aria-label="Active fault">
            <For each={faulted()} fallback={<option value="">no active fault</option>}>{(f) => <option value={f} selected={(clearName() || faulted()[0]) === f}>{f}</option>}</For>
          </select>
          <button class="b" disabled={off() || !faulted().length} title={wb() || (faulted().length ? 'Clear the fault' : 'No fault is active')} onClick={() => void run('clear_fault', [faulted().includes(clearName()) ? clearName() : faulted()[0]])}>Clear fault</button>
          <button class="b" disabled={off() || !tagBool('_Sim_/Fault/GlycolFailure')} title={wb() || (tagBool('_Sim_/Fault/GlycolFailure') ? 'Bring the glycol chiller back' : 'The chiller is running')} onClick={() => void run('glycol_restore')}>Glycol restore</button>
        </div>
        <Show when={faulted().length}><div class="note warn">Active now: {faulted().join(', ')}</div></Show>
      </section>

      <section class="cs">
        <h4>Quality <small>release a batch on HOLD, or dump beer that is in a tank</small></h4>
        <div class="line">
          <select onChange={(e) => setQaBatch(e.currentTarget.value)} disabled={off()} aria-label="Batch">
            <option value="" selected={qaBatch() === ''}>select a batch</option>
            <For each={batches()}>{(b) => <option value={b.id} selected={qaBatch() === b.id}>{b.id} · {b.qa || b.state}</option>}</For>
          </select>
        </div>
        <QaButtons batch={qaBatch()} />
      </section>

      <h3>Director <small>{canAdmin() ? '' : ab()}</small></h3>

      <section class="cs">
        <h4>Scenario</h4>
        <div class="seg">
          <For each={SCENARIOS}>
            {(s) => (
              <button classList={{ on: scenario() === s }} disabled={!canAdmin() || busy() || scenario() === s} title={ab() || s} onClick={() => void run('set_scenario', [s])}>{s.replaceAll('_', ' ')}</button>
            )}
          </For>
        </div>
      </section>

      <section class="cs">
        <h4>Inject fault</h4>
        <div class="line">
          <select onChange={(e) => setInjectName(e.currentTarget.value)} disabled={!canAdmin() || busy()} aria-label="Fault">
            <For each={Object.keys(FAULTS)}>{(f) => <option value={f} selected={injectName() === f}>{f}</option>}</For>
          </select>
          <button class="b danger" disabled={!canAdmin() || busy()} title={ab() || `Inject ${injectName()}`} onClick={() => void run('inject_fault', [injectName()])}>Inject</button>
        </div>
      </section>

      <section class="cs">
        <h4>Schedule <small>now {tagNum('Schedule/BrewsPerDay')} per day · {tagStr('Schedule/Queue') || '—'}</small></h4>
        <div class="line">
          <select onChange={(e) => setBpd(Number(e.currentTarget.value))} disabled={!canAdmin() || busy()} aria-label="Brews per day">
            <For each={[1, 2, 3, 4, 5, 6]}>{(n) => <option value={String(n)} selected={bpd() === n}>{n} / day</option>}</For>
          </select>
          <input value={queueText()} onInput={(e) => setQueue(e.currentTarget.value)} disabled={!canAdmin() || busy()} aria-label="Recipe queue" spellcheck={false} style={{ flex: 1, 'min-width': '140px' }} />
          <button class="b" disabled={!canAdmin() || busy() || !queueValid()} title={ab() || (queueValid() ? 'Apply the schedule' : `Queue: ${RECIPES.join(', ')} separated by commas`)} onClick={() => void run('set_schedule', [bpd(), queueText()])}>Apply</button>
        </div>
      </section>

      <section class="cs">
        <h4>Speed <small>24 simulated hours in {num(1440 / (Number.isFinite(speed()) && speed() > 0 ? speed() : 60), 0)} real minutes</small></h4>
        <div class="seg">
          <For each={SPEEDS}>
            {(f) => <button classList={{ on: speed() === f }} disabled={!canAdmin() || busy() || speed() === f} title={ab() || `${f}×`} onClick={() => void run('set_speed', [f])}>{f}×</button>}
          </For>
        </div>
      </section>

      <section class="cs">
        <h4>Ferment acceleration <small>fermentation, conditioning, carbonation</small></h4>
        <div class="seg">
          <For each={ACCELS}>
            {(x) => <button classList={{ on: accel() === x }} disabled={!canAdmin() || busy() || accel() === x} title={ab() || `${x}×`} onClick={() => void run('set_ferment_accel', [x])}>{x}×</button>}
          </For>
        </div>
      </section>
    </Panel>
  );
}
