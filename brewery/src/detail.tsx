import { For, Show, createMemo } from 'solid-js';
import { hover } from './selection';
import { batchRows } from './strip/batches';
import { tag, tagNum, tagStr } from './live/store';
import { MACHINE_LABEL, SLOTS, recipeColor } from './model';
import { hhmm, num, pretty, unitOf } from './fmt';

type Row = [label: string, value: string, tone?: 'warn' | 'alarm' | 'ok'];

/** "<value> <unit>" for a tag, '—' while it has not arrived. */
const val = (name: string, digits = 1): string => {
  const v = tag(name);
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return `${num(v, digits)}${unitOf(name) ? ' ' + unitOf(name) : ''}`;
  return String(v);
};
const text = (name: string): string => pretty(tagStr(name));
const sp = (a: string, b: string, d = 1): string => `${num(tagNum(a), d)} / ${num(tagNum(b), d)} °C`;

function brewRows(id: string): Row[] {
  const b = `Brewhouse/${id}`;
  if (id === 'HLT' || id === 'CLT') return [['Level', val(`${b}/LevelPct`, 0)], ['Temperature', val(`${b}/TempC`)]];
  const rows: Row[] = [
    ['Phase', `${text(`${b}/Phase`)}${tagNum(`${b}/PhaseRemainingMin`) > 0 ? ` · ${num(tagNum(`${b}/PhaseRemainingMin`), 0)} min left` : ''}`],
    ['Batch', `${tagStr(`${b}/BatchId`) || '—'} ${tagStr(`${b}/Recipe`)}`],
    ['Level', val(`${b}/LevelPct`, 0)],
    ['Temp / setpoint', sp(`${b}/TempC`, `${b}/SetpointC`)],
  ];
  const extra: Record<string, [string, string, number][]> = {
    MashTun: [['pH', 'pH', 2], ['Gravity', 'GravityP', 1], ['Rake', 'RakeRPM', 1]],
    LauterTun: [['Run-off', 'RunoffLpm', 1], ['Sparge', 'SpargeLpm', 1], ['Turbidity', 'TurbidityNTU', 0]],
    Kettle: [['Gravity', 'GravityP', 1], ['Steam', 'SteamKgph', 0], ['Evaporation', 'EvapPct', 1], ['Foam', 'FoamLevelPct', 0], ['Boil-over risk', 'BoilOverRisk', 0]],
    Whirlpool: [['Rest', 'RestMin', 0], ['Trub', 'TrubPct', 0]],
    Chiller: [['Wort out', 'WortOutC', 1], ['Flow', 'FlowLpm', 0], ['Glycol valve', 'GlycolValvePct', 0]],
  };
  for (const [l, t, d] of extra[id] ?? []) rows.push([l, val(`${b}/${t}`, d)]);
  return rows;
}

function cellarRows(id: string): Row[] {
  const b = `Cellar/${id}`;
  if (id.startsWith('BBT')) {
    return [
      ['Phase', text(`${b}/Phase`)],
      ['Batch', `${tagStr(`${b}/BatchId`) || '—'} ${tagStr(`${b}/Recipe`)}`],
      ['Level', val(`${b}/LevelPct`, 0)],
      ['Temperature', val(`${b}/TempC`)],
      ['CO₂', val(`${b}/CO2Vol`, 2)],
      ['Ready to package', tag(`${b}/ReadyToPackage`) ? 'yes' : 'no'],
    ];
  }
  const dev = Math.abs(tagNum(`${b}/TempC`) - tagNum(`${b}/SetpointC`));
  return [
    ['Phase', text(`${b}/Phase`)],
    ['Batch', `${tagStr(`${b}/BatchId`) || '—'} ${tagStr(`${b}/Recipe`)}`],
    ['Temp / setpoint', sp(`${b}/TempC`, `${b}/SetpointC`), dev > 2.5 ? 'alarm' : undefined],
    ['Gravity', val(`${b}/GravityP`, 2)],
    ['pH', val(`${b}/pH`, 2)],
    ['ABV (est.)', val(`${b}/ABVEst`, 2)],
    ['Pressure', val(`${b}/PressurePSI`, 1), tagNum(`${b}/PressurePSI`) > 15 ? 'alarm' : undefined],
    ['Level', val(`${b}/LevelPct`, 0)],
    ['Days in tank', val(`${b}/DaysInTank`, 1)],
    ['Glycol valve', val(`${b}/GlycolValvePct`, 0)],
  ];
}

const UTIL: Record<string, [string, string, number][]> = {
  Boiler: [['Pressure', 'Utilities/Boiler/PressureBar', 2], ['Steam', 'Utilities/Boiler/SteamKgph', 0], ['Fuel', 'Utilities/Boiler/FuelKwh', 0], ['State', 'Utilities/Boiler/State', 0]],
  Glycol: [['Supply', 'Utilities/Glycol/SupplyC', 1], ['Return', 'Utilities/Glycol/ReturnC', 1], ['Load', 'Utilities/Glycol/LoadPct', 0], ['Compressor', 'Utilities/Glycol/CompressorOn', 0]],
  CO2: [['Tank', 'Utilities/CO2/TankPct', 0], ['Consumption', 'Utilities/CO2/ConsumptionKgph', 1], ['Recovered', 'Utilities/CO2/RecoveredPct', 0]],
  Air: [['Pressure', 'Utilities/Air/PressureBar', 2]],
  CIP: [['Step', 'Utilities/CIP/Step', 0], ['Target', 'Utilities/CIP/TargetUnit', 0], ['Conductivity', 'Utilities/CIP/ConductivitymS', 1], ['Temperature', 'Utilities/CIP/TempC', 1]],
};

function lineRows(id: string): Row[] {
  const L = 'Packaging/Line';
  const rows: Row[] = [];
  if (id !== 'Line') {
    const m = `Packaging/${id}`;
    rows.push(['State', text(`${m}/State`), tag(`${m}/Fault`) ? 'alarm' : undefined], ['Count in / out', `${val(`${m}/CountIn`, 0)} / ${val(`${m}/CountOut`, 0)}`]);
  }
  rows.push(
    ['Line', `${text(`${L}/State`)}${tagNum(`${L}/SpeedCPM`) > 0 ? ` · ${num(tagNum(`${L}/SpeedCPM`), 0)} cpm` : ''}`],
    ['Downtime reason', text(`${L}/DowntimeReason`), tagStr(`${L}/DowntimeReason`) !== 'NONE' ? 'warn' : undefined],
    ['Run', `${tagStr(`${L}/BatchId`) || '—'} ${tagStr(`${L}/Recipe`)} · ${tagStr(`${L}/Format`)}`],
    ['Good / rejects', `${val(`${L}/GoodCount`, 0)} / ${val(`${L}/RejectCount`, 0)}`],
    ['OEE', `${num(tagNum('Packaging/OEE/OEE') * 100, 1)} %`],
  );
  return rows;
}

function batchDetail(id: string): { title: string; color: string; rows: Row[] } | null {
  const slot = SLOTS.find((s) => tagStr(`Batches/${s}/Id`) === id);
  if (!slot) return null;
  const b = `Batches/${slot}`;
  const r = [...batchRows().active, ...(batchRows().next ? [batchRows().next!] : [])].find((x) => x.id === id);
  const start = tagNum(`${b}/StartHour`);
  return {
    title: `${id} · ${tagStr(`${b}/Recipe`)}`,
    color: recipeColor(tagStr(`${b}/Recipe`)),
    rows: [
      ['State', `${text(`${b}/State`)}${r?.phase ? ` · ${pretty(r.phase)}` : ''}`],
      ['Scheduled start', Number.isFinite(start) ? `Day ${Math.floor(start / 24)} ${hhmm(start % 24)}` : '—'],
      ['Tanks', `${tagStr(`${b}/FV`) || '—'} → ${tagStr(`${b}/BBT`) || '—'}`],
      ['Volume', val(`${b}/Hl`, 2)],
      ['OG / FG', `${num(tagNum(`${b}/OG`), 1)} / ${num(tagNum(`${b}/FG`), 1)} °P`],
      ['ABV · IBU', `${num(tagNum(`${b}/ABV`), 2)} % · ${num(tagNum(`${b}/IBU`), 0)}`],
      ['QA', text(`${b}/QAStatus`), tagStr(`${b}/QAStatus`) === 'HOLD' ? 'alarm' : tagStr(`${b}/QAStatus`) === 'PASS' ? 'ok' : undefined],
      ['Packaged', `${val(`${b}/Cans`, 0)} · ${tagNum(`${b}/Pallets`)} pallets`],
    ],
  };
}

/** Live tooltip next to the pointer; rows are read from the tags, so they move with the data. */
export default function Tooltip() {
  // The target only changes when the pointer moves to another element; the position follows every move.
  const target = createMemo(
    () => {
      const h = hover();
      return h ? { kind: h.kind, id: h.id } : null;
    },
    null,
    { equals: (a, b) => a?.kind === b?.kind && a?.id === b?.id },
  );
  const content = () => {
    const h = target();
    if (!h) return null;
    if (h.kind === 'batch') return batchDetail(h.id);
    if (h.kind === 'line') return { title: h.id === 'Line' ? 'Packaging line' : MACHINE_LABEL[h.id] ?? h.id, color: '', rows: lineRows(h.id) };
    if (h.kind === 'util') {
      const rows: Row[] = (UTIL[h.id] ?? []).map(([l, t, d]): Row => {
        const v = tag(t);
        return [l, typeof v === 'boolean' ? (v ? 'on' : 'off') : val(t, d)];
      });
      return { title: h.id === 'CIP' ? 'CIP skid' : h.id === 'CO2' ? 'CO₂ system' : h.id, color: '', rows };
    }
    const cellar = h.id.startsWith('FV') || h.id.startsWith('BBT');
    const rows = cellar ? cellarRows(h.id) : brewRows(h.id);
    const recipe = tagStr(`${cellar ? 'Cellar' : 'Brewhouse'}/${h.id}/Recipe`);
    return { title: h.id, color: recipe ? recipeColor(recipe) : '', rows };
  };
  const pos = () => {
    const h = hover();
    if (!h) return {};
    const w = 270;
    const x = h.x + 16 + w > window.innerWidth ? h.x - 16 - w : h.x + 16;
    const y = Math.min(h.y + 14, window.innerHeight - 260);
    return { left: `${Math.max(8, x)}px`, top: `${Math.max(8, y)}px` };
  };
  return (
    <Show when={content()}>
      {(c) => (
        <div class="tip mono" style={pos()} role="tooltip">
          <div class="t">
            <Show when={c().color}>
              <i style={{ background: c().color }} />
            </Show>
            {c().title}
          </div>
          <For each={c().rows}>
            {(r) => (
              <div class="r">
                <span>{r[0]}</span>
                <b classList={{ warn: r[2] === 'warn', alarm: r[2] === 'alarm', ok: r[2] === 'ok' }}>{r[1]}</b>
              </div>
            )}
          </For>
        </div>
      )}
    </Show>
  );
}
