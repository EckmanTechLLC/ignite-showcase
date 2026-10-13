import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import Panel from '../Panel';
import QaButtons from '../controls/Qa';
import { atRisk, genealogy, phaseRows, qaPoints, readRecipe, readRing, PHASE_LABEL, type Batch } from './model';
import { brewRows, cellarRows, lineRows } from '../../detail';
import { selectedBatch, setSel } from '../../selection';
import { simNowH, tagBool, tagNum, tagStr } from '../../live/store';
import { INACTIVE_STATES, recipeColor } from '../../model';
import { hhmm, num, pretty } from '../../fmt';

const dayHour = (h: number): string => (Number.isFinite(h) ? `D${Math.floor(h / 24)} ${hhmm(h % 24)}` : '—');
const hrs = (h: number | undefined): string => (h === undefined || !Number.isFinite(h) ? '—' : `${h.toFixed(2)} h`);
const BREWHOUSE = ['Mill', 'MashTun', 'LauterTun', 'Kettle', 'Whirlpool', 'Chiller'] as const;

type Tab = 'detail' | 'list';
type Filter = 'all' | 'active' | 'hold' | 'planned' | 'complete' | 'dumped';
const FILTERS: Filter[] = ['all', 'active', 'hold', 'planned', 'complete', 'dumped'];

/** True while the contamination scenario runs (the scenario tag or its fault flag). */
const contaminated = () => tagStr('_Sim_/Scenario') === 'contamination' || tagBool('_Sim_/Fault/Contamination');

function BatchDetail(p: { id: string }) {
  const ring = createMemo(readRing);
  const batch = createMemo<Batch | undefined>(() => ring().find((b) => b.id === p.id));
  return (
    <Show when={batch()} fallback={<div class="empty">{p.id} is not in the ring (the ring keeps the last 24 batches).</div>}>
      {(b) => <Detail b={b()} ring={ring()} />}
    </Show>
  );
}

function Detail(p: { b: Batch; ring: Batch[] }) {
  const recipe = createMemo(() => readRecipe(p.b.recipe));
  const accel = () => tagNum('_Sim_/FermentAccel');
  const rows = createMemo(() => phaseRows(p.b.timeline, recipe(), accel(), simNowH()));
  const maxH = createMemo(() => Math.max(1, ...rows().map((r) => Math.max(Number.isFinite(r.actual) ? r.actual : 0, r.recipe ?? 0))));
  const points = createMemo(() => qaPoints(p.b, recipe()));
  const gen = createMemo(() => genealogy(p.b));
  const units = createMemo(() => {
    const out: { key: string; title: string; rows: ReturnType<typeof brewRows> }[] = [];
    for (const u of BREWHOUSE) if (tagStr(`Brewhouse/${u}/BatchId`) === p.b.id) out.push({ key: u, title: u, rows: brewRows(u) });
    const tank = (id: string) => out.push({ key: id, title: id, rows: cellarRows(id) });
    if (p.b.fv && tagStr(`Cellar/${p.b.fv}/BatchId`) === p.b.id) tank(p.b.fv);
    if (p.b.bbt && tagStr(`Cellar/${p.b.bbt}/BatchId`) === p.b.id) tank(p.b.bbt);
    if (tagStr('Packaging/Line/BatchId') === p.b.id) out.push({ key: 'Line', title: 'Packaging line', rows: lineRows('Line') });
    return out;
  });
  const source = createMemo(() => (contaminated() ? p.ring.find((b) => b.qa === 'HOLD') : undefined));
  const risk = createMemo(() => {
    const s = source();
    return s ? atRisk(s, p.ring, (r) => tagStr(`Recipes/${r}/Yeast`)) : [];
  });
  const mine = () => risk().find((r) => r.id === p.b.id);
  const yeastGen = () => tagNum('Cellar/Yeast/Generation');
  const sameStrain = () => tagStr('Cellar/Yeast/Strain') === recipe().yeast;

  return (
    <>
      <Show when={contaminated()}>
        <div class="risk" role="status">
          <h4>At risk · contamination</h4>
          <Show when={source()} fallback={<p class="note">The contamination scenario is running; no batch is on QA HOLD yet.</p>}>
            <p class="note">
              {source()!.id} ({source()!.recipe}) is on QA HOLD in {source()!.fv || 'the cellar'}.{' '}
              {source()!.id === p.b.id ? 'This is the held batch.' : mine() ? `This batch is exposed: ${mine()!.reason}.` : 'This batch shares no tank or yeast with it.'}
            </p>
            <Show when={risk().length}>
              <ul>
                <For each={risk()}>
                  {(r) => (
                    <li>
                      <a href="#" onClick={(e) => { e.preventDefault(); setSel({ kind: 'batch', id: r.id }); }}>{r.id}</a>: {r.reason}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>
      </Show>

      <div class="bcard">
        <div class="bt">
          <i style={{ background: recipeColor(p.b.recipe) }} />
          {p.b.id} · {p.b.recipe}
          <small>{pretty(p.b.state)}{p.b.phase ? ` · ${pretty(p.b.phase)}` : ''}</small>
        </div>
        <div class="kv">
          <div><span>Mash</span><b>{num(recipe().mashTemp, 0)} °C · {num(recipe().mashMin, 0)} min</b></div>
          <div><span>Boil</span><b>{num(recipe().boilMin, 0)} min</b></div>
          <div><span>Target OG / FG</span><b>{num(recipe().og, 1)} / {num(recipe().fg, 1)} °P</b></div>
          <div><span>Ferment</span><b>{num(recipe().fermTemp, 0)} °C · {num(recipe().fermDays, 0)} d</b></div>
          <div><span>Condition</span><b>{num(recipe().condDays, 0)} d</b></div>
          <div><span>IBU</span><b>{num(recipe().ibu, 0)}</b></div>
          <div><span>Yeast</span><b>{recipe().yeast || '—'}</b></div>
          <div><span>Format</span><b>{recipe().format || '—'}</b></div>
          <div><span>Volume</span><b>{num(p.b.hl, 2)} hl</b></div>
          <div><span>Start</span><b>{dayHour(p.b.start)}</b></div>
        </div>
      </div>

      <h3>ISA-88 phases <small>actual vs recipe, simulated hours</small></h3>
      <div class="ptl">
        <For each={rows()}>
          {(r) => (
            <>
              <span class="nm" classList={{ cur: r.status === 'cur' }}>{PHASE_LABEL[r.phase]}</span>
              <div class="trk" title={r.status === 'todo' ? 'not reached' : `${dayHour(r.from)} · ${hrs(r.actual)}`} style={{ opacity: r.status === 'todo' ? 0.4 : 1 }}>
                <Show when={Number.isFinite(r.actual)}>
                  <i style={{ left: '0', width: `${Math.min(100, (r.actual / maxH()) * 100)}%`, 'background-color': r.status === 'cur' ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 55%, var(--bg-3))' }} />
                </Show>
                <Show when={r.recipe !== undefined}>
                  <u style={{ left: `${Math.min(99.5, ((r.recipe ?? 0) / maxH()) * 100)}%` }} />
                </Show>
              </div>
              <span class="tm">
                <b>{Number.isFinite(r.actual) ? hrs(r.actual) : '—'}</b> / {hrs(r.recipe)}
              </span>
            </>
          )}
        </For>
      </div>
      <p class="hint">Bar = actual, white tick = recipe time (fermentation and conditioning at the current acceleration of {num(accel(), 0)}×). A slow lauter or a held batch shows as a bar past its tick.</p>

      <h3>Unit now <small>live process values</small></h3>
      <Show when={units().length} fallback={<div class="empty">{p.b.state === 'PLANNED' ? 'Planned: not in any unit yet.' : 'No unit holds this batch at the moment.'}</div>}>
        <For each={units()}>
          {(u) => (
            <div class="bcard">
              <div class="bt">{u.title}</div>
              <div class="kv">
                <For each={u.rows}>
                  {(r) => (
                    <div>
                      <span>{r[0]}</span>
                      <b style={{ color: r[2] === 'alarm' ? 'var(--alarm)' : r[2] === 'warn' ? 'var(--warn)' : undefined }}>{r[1]}</b>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </Show>

      <h3>Quality <small>PASS | HOLD | FAIL per sample point</small></h3>
      <table class="qa">
        <thead>
          <tr><th>Sample point</th><th>Results</th><th>Verdict</th></tr>
        </thead>
        <tbody>
          <For each={points()}>
            {(q) => (
              <tr>
                <td>{q.point}</td>
                <td>
                  <For each={q.values}>{(v) => <div>{v.label} <b>{v.text}</b></div>}</For>
                </td>
                <td>
                  <span class={`tag ${q.verdict}`}>{q.verdict}</span>
                  <div class="hint" style={{ margin: 0 }}>{q.basis === 'record' ? 'batch record' : 'checked against the recipe'}</div>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <p class="hint">Overall <span class={`tag ${p.b.qa || 'PENDING'}`}>{p.b.qa || 'PENDING'}</span> — a HOLD blocks the transfer and packaging until it is released or the beer is dumped.</p>
      <QaButtons batch={p.b.id} />

      <h3>Genealogy <small>brewhouse units, tanks, run, pallets</small></h3>
      <div class="gen">
        <For each={gen()}>
          {(n, i) => (
            <>
              <Show when={i() > 0}><span class="arrow">›</span></Show>
              <div class={`node ${n.status}`}>
                <b>{n.title}</b>
                {n.detail}
              </div>
            </>
          )}
        </For>
      </div>
      <div class="kv" style={{ 'margin-top': '8px' }}>
        <div><span>Yeast</span><b>{recipe().yeast || '—'}{sameStrain() && Number.isFinite(yeastGen()) ? ` · pitch gen ${yeastGen()} now` : ''}</b></div>
        <div><span>Package</span><b>{recipe().format || '—'}</b></div>
        <div><span>Packages</span><b>{Number.isFinite(p.b.cans) ? Math.round(p.b.cans).toLocaleString('en-US') : '—'}</b></div>
        <div><span>Yield</span><b>{p.b.yieldPct > 0 ? `${num(p.b.yieldPct, 1)} %` : '—'}</b></div>
      </div>
      <p class="hint">The yeast generation is the cellar's current pitch generation, not stored per batch.</p>
    </>
  );
}

function BatchList(p: { onOpen: () => void }) {
  const [filter, setFilter] = createSignal<Filter>('all');
  const ring = createMemo(readRing);
  const shown = createMemo(() =>
    ring()
      .filter((b) => {
        switch (filter()) {
          case 'all': return true;
          case 'active': return !INACTIVE_STATES.has(b.state);
          case 'hold': return b.qa === 'HOLD';
          case 'planned': return b.state === 'PLANNED';
          case 'complete': return b.state === 'COMPLETE';
          case 'dumped': return b.state === 'DUMPED';
        }
      })
      .sort((a, b) => (b.start || 0) - (a.start || 0)),
  );
  const count = (f: Filter) => (f === 'all' ? ring().length : ring().filter((b) => (f === 'active' ? !INACTIVE_STATES.has(b.state) : f === 'hold' ? b.qa === 'HOLD' : b.state === f.toUpperCase())).length);
  return (
    <>
      <div class="tabs" style={{ 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
        <For each={FILTERS}>
          {(f) => (
            <button class="pill" classList={{ on: filter() === f }} onClick={() => setFilter(f)}>
              {f} {count(f)}
            </button>
          )}
        </For>
      </div>
      <div class="blist">
        <For each={shown()} fallback={<div class="empty">No batch matches.</div>}>
          {(b) => (
            <div class="brow" classList={{ sel: selectedBatch() === b.id }} onClick={() => { setSel({ kind: 'batch', id: b.id }); p.onOpen(); }}>
              <i style={{ background: recipeColor(b.recipe) }} />
              <b>{b.id}</b>
              <span>{b.recipe} · {b.fv || '—'}{b.bbt ? ` → ${b.bbt}` : ''}</span>
              <span>{pretty(b.state)}</span>
              <span class={`tag ${b.qa || 'PENDING'}`}>{b.qa || 'PENDING'}</span>
            </div>
          )}
        </For>
      </div>
      <p class="hint">The ring holds the last 24 batch records (slot B01 to B24). Click a row to open it.</p>
    </>
  );
}

export default function BatchPanel() {
  const [tab, setTab] = createSignal<Tab>(selectedBatch() ? 'detail' : 'list');
  createEffect(on(selectedBatch, (id) => id && setTab('detail'), { defer: true }));
  return (
    <Panel
      title="Batch"
      hotkey="B"
      head={
        <>
          <button class="pill" classList={{ on: tab() === 'detail' }} onClick={() => setTab('detail')}>Detail</button>
          <button class="pill" classList={{ on: tab() === 'list' }} onClick={() => setTab('list')}>All 24 records</button>
        </>
      }
    >
      <Show when={tab() === 'detail'} fallback={<BatchList onOpen={() => setTab('detail')} />}>
        <Show when={selectedBatch()} fallback={<div class="empty">No batch selected. Click a vessel or a bar in the strip, or pick one from “All 24 records”.</div>}>
          <BatchDetail id={selectedBatch()} />
        </Show>
      </Show>
    </Panel>
  );
}
