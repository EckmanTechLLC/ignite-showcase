import { For, Show, createMemo } from 'solid-js';
import { batchRows, simNowH, type BatchRow } from './batches';
import { PHASE_GROUPS, recipeColor } from '../model';
import { hhmm } from '../fmt';
import { selectedBatch, setHover, setSel } from '../selection';
import { tagNum } from '../live/store';

const PLANNED_SPAN_H = 6; // ghost bar for the next brew (the brewhouse part of a batch)

/** Day and hour of an absolute sim hour: "D3 18:00". */
const dayHour = (h: number): string => `D${Math.floor(h / 24)} ${hhmm(h % 24)}`;

/** Top strip: a live Gantt of every active batch across its phases, plus the next planned brew. */
export default function BatchStrip() {
  const now = () => {
    const n = simNowH();
    return Number.isFinite(n) ? n : 0;
  };
  const win = createMemo(() => {
    const { active, next } = batchRows();
    const n = now();
    const starts = active.map((r) => r.start).filter(Number.isFinite);
    const left = Math.max(n - 66, (starts.length ? Math.min(...starts) : n - 6) - 1.5);
    const right = Math.max(n + 8, next && Number.isFinite(next.start) ? next.start + PLANNED_SPAN_H + 2 : 0);
    return { left, span: Math.max(12, right - left) };
  });
  const pct = (h: number): number => ((h - win().left) / win().span) * 100;
  const ticks = createMemo(() => {
    const { left, span } = win();
    const out: number[] = [];
    for (let h = Math.ceil(left / 6) * 6; h <= left + span; h += 6) out.push(h);
    return out;
  });
  const rowsCount = () => batchRows().active.length + (batchRows().next ? 1 : 0);

  const hov = (e: MouseEvent, id: string) => setHover({ kind: 'batch', id, x: e.clientX, y: e.clientY });

  const Bar = (p: { row: BatchRow }) => {
    const color = () => recipeColor(p.row.recipe);
    return (
      <div
        class="bar"
        classList={{ sel: selectedBatch() === p.row.id, hold: p.row.hold }}
        onMouseMove={(e) => hov(e, p.row.id)}
        onMouseLeave={() => setHover(null)}
        onClick={() => setSel({ kind: 'batch', id: p.row.id })}
      >
        <For each={p.row.segs}>
          {(s) => {
            const to = () => (Number.isFinite(s.to) ? s.to : now());
            return (
              <div
                class="seg"
                classList={{ running: !Number.isFinite(s.to) }}
                style={{
                  left: `${pct(s.from)}%`,
                  width: `${Math.max(0.15, pct(to()) - pct(s.from))}%`,
                  '--c': color(),
                  '--g': String(s.group),
                }}
                title={PHASE_GROUPS[s.group].key}
              >
                <Show when={pct(to()) - pct(s.from) > 7}>
                  <span>{PHASE_GROUPS[s.group].key}</span>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    );
  };

  return (
    <section class="strip mono" aria-label="Batch schedule">
      <div class="axis">
        <div class="lab">BATCHES · sim time</div>
        <div class="track">
          <For each={ticks()}>
            {(h) => (
              <span class="tick" classList={{ day: h % 24 === 0 }} style={{ left: `${pct(h)}%` }}>
                {h % 12 === 0 ? dayHour(h) : ''}
              </span>
            )}
          </For>
        </div>
      </div>
      <div class="rows" style={{ '--n': String(Math.max(1, rowsCount())) }}>
        <For each={batchRows().active}>
          {(r) => (
            <div class="row" classList={{ sel: selectedBatch() === r.id }}>
              <div class="lab" title={`${r.id} ${r.recipe} ${r.state}`}>
                <i class="pip" style={{ '--c': recipeColor(r.recipe) }} />
                <b>{r.id}</b> {r.recipe}
                <em>{r.hold ? 'HOLD' : r.bbt || r.fv}</em>
              </div>
              <div class="track">
                <Bar row={r} />
              </div>
            </div>
          )}
        </For>
        <Show when={batchRows().next}>
          {(n) => (
            <div class="row planned">
              <div class="lab">
                <i class="pip" style={{ '--c': recipeColor(n().recipe) }} />
                <b>{n().id}</b> {n().recipe}
                <em>PLANNED</em>
              </div>
              <div class="track">
                <div
                  class="ghost"
                  style={{ left: `${pct(n().start)}%`, width: `${(PLANNED_SPAN_H / win().span) * 100}%`, '--c': recipeColor(n().recipe) }}
                  onMouseMove={(e) => hov(e, n().id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span>next · {dayHour(n().start)}</span>
                </div>
              </div>
            </div>
          )}
        </Show>
        <Show when={rowsCount() === 0}>
          <div class="empty">No batch in progress</div>
        </Show>
        <div class="nowline" style={{ left: `calc(var(--lab-w) + (100% - var(--lab-w)) * ${pct(now()) / 100})` }}>
          <span>NOW {Number.isFinite(tagNum('Time/HourOfDay')) ? hhmm(tagNum('Time/HourOfDay')) : ''}</span>
        </div>
      </div>
    </section>
  );
}
