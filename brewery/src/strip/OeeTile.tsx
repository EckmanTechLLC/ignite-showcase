import { Show } from 'solid-js';
import Roll from '../hud/Roll';
import { tagNum, tagStr } from '../live/store';
import { num, pretty } from '../fmt';
import { setHover, setSel, sel } from '../selection';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Right-hand tile: OEE as availability x performance x quality, the downtime reason, rolling counts. */
export default function OeeTile() {
  const a = () => tagNum('Packaging/OEE/Availability');
  const p = () => tagNum('Packaging/OEE/Performance');
  const q = () => tagNum('Packaging/OEE/Quality');
  const oee = () => tagNum('Packaging/OEE/OEE');
  const state = () => tagStr('Packaging/Line/State');
  const reason = () => tagStr('Packaging/Line/DowntimeReason');
  const tone = () => (state() === 'RUNNING' ? 'ok' : state() === 'DOWN' ? 'alarm' : state() === 'IDLE' ? 'off' : 'warn');
  const good = () => tagNum('Packaging/Line/GoodCount');
  const rej = () => tagNum('Packaging/Line/RejectCount');
  const target = () => tagNum('Packaging/Line/ShiftTargetCans');
  const factors = () => [
    { k: 'A', name: 'Availability', v: a() },
    { k: 'P', name: 'Performance', v: p() },
    { k: 'Q', name: 'Quality', v: q() },
  ];
  return (
    <aside
      class="oee mono"
      classList={{ selected: sel()?.kind === 'line' }}
      aria-label="Packaging line OEE"
      onClick={() => setSel({ kind: 'line', id: 'Line' })}
      onMouseMove={(e) => setHover({ kind: 'line', id: 'Line', x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHover(null)}
    >
      <div class="head">
        <span class="k">OEE · {tagStr('Time/Shift')} SHIFT</span>
        <span class={`pill ${tone()}`}>{state() || '—'}</span>
      </div>
      <div class="big">
        <Roll value={oee() * 100} digits={1} />
        <span class="u"> %</span>
      </div>
      <div class="eq">
        {factors().map((f) => (
          <div class="f" title={f.name}>
            <span class="n">{f.k}</span>
            <div class="bar"><i style={{ transform: `scaleX(${clamp01(f.v)})` }} /></div>
            <span class="val"><Roll value={f.v * 100} digits={1} /></span>
          </div>
        ))}
      </div>
      <div class="why" classList={{ none: !reason() || reason() === 'NONE' }}>
        <span class="k">DOWNTIME</span>
        <b>{!reason() || reason() === 'NONE' ? 'none' : pretty(reason())}</b>
      </div>
      <div class="counts">
        <div>
          <span class="k">GOOD</span>
          <b><Roll value={good()} group /></b>
        </div>
        <div>
          <span class="k">REJECTS</span>
          <b><Roll value={rej()} group /></b>
        </div>
        <div>
          <span class="k">SPEED</span>
          <b><Roll value={tagNum('Packaging/Line/SpeedCPM')} /> <small>cpm</small></b>
        </div>
      </div>
      <Show when={Number.isFinite(target()) && target() > 0}>
        <div class="goal" title="Good count against the shift target">
          <div class="bar"><i style={{ transform: `scaleX(${clamp01(good() / target())})` }} /></div>
          <span>{num((good() / target()) * 100, 0)} % of {Math.round(target())} target</span>
        </div>
      </Show>
      <div class="foot">
        {tagStr('Packaging/Line/BatchId') ? `${tagStr('Packaging/Line/BatchId')} ${tagStr('Packaging/Line/Recipe')} · ` : ''}
        {tagNum('Packaging/Line/PalletsToday')} pallets · {tagNum('Packaging/Line/CasesToday')} cases today
      </div>
    </aside>
  );
}
