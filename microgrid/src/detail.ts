import { tagBool, tagNum, tagStr } from './live/store.svelte';
import { num, pretty } from './fmt';
import { BLDG_NAME } from './campus/model';
import type { Target } from './selection.svelte';

export interface Row {
  k: string;
  v: string;
  tone?: 'ok' | 'warn' | 'alarm';
}
export interface Detail {
  title: string;
  sub: string;
  rows: Row[];
}

const kw = (v: number, d = 1) => `${num(v, d)} kW`;

/** Tooltip content for a map element. Called inside a `$derived`, so every tag read is live. */
export function detailFor(t: Target): Detail {
  switch (t.kind) {
    case 'grid': {
      const imp = tagNum('Grid/ImportkW');
      const exp = tagNum('Grid/ExportkW');
      const avail = tagBool('Grid/Available');
      const isl = tagBool('Grid/Islanded');
      return {
        title: 'Utility intertie',
        sub: !avail ? 'grid lost' : isl ? 'islanded (resync pending)' : 'connected',
        rows: [
          { k: 'Import', v: kw(imp) },
          { k: 'Export', v: kw(exp) },
          { k: 'Voltage', v: `${num(tagNum('Grid/VoltageV'), 0)} V` },
          { k: 'Frequency', v: `${num(tagNum('Grid/FrequencyHz'), 2)} Hz` },
          { k: '15 min demand', v: `${num(tagNum('Grid/DemandkW'), 0)} / ${num(tagNum('Grid/DemandLimitkW'), 0)} kW`, tone: tagNum('Grid/DemandkW') > tagNum('Grid/DemandLimitkW') ? 'alarm' : undefined },
          { k: 'Export limit', v: kw(tagNum('Grid/ExportLimitkW'), 0) },
          { k: 'Today in / out', v: `${num(tagNum('Grid/TodayImportkWh'), 0)} / ${num(tagNum('Grid/TodayExportkWh'), 0)} kWh` },
        ],
      };
    }
    case 'pv': {
      const n = (s: string) => tagNum(`PV/${t.id}/${s}`);
      return {
        title: `PV array ${t.id}`,
        sub: '2 inverters x 6 strings, 180 kWp / 150 kW AC',
        rows: [
          { k: 'AC output', v: kw(n('ACkW')) },
          { k: 'DC power', v: kw(n('DCkW')) },
          { k: 'Curtail limit', v: tagBool(`PV/${t.id}/Curtailed`) ? kw(n('CurtailSetpointkW'), 0) : 'none', tone: tagBool(`PV/${t.id}/Curtailed`) ? 'warn' : undefined },
          { k: 'Health', v: `${num(n('Health'), 0)} %`, tone: n('Health') < 70 ? 'alarm' : undefined },
          { k: 'Today', v: `${num(n('TodaykWh'), 0)} kWh` },
        ],
      };
    }
    case 'bess': {
      const n = (s: string) => tagNum(`BESS/${t.id}/${s}`);
      const p = n('kW');
      return {
        title: `BESS ${t.id}`,
        sub: `${tagStr(`BESS/${t.id}/State`)} · ${pretty(tagStr(`BESS/${t.id}/Mode`))}`,
        rows: [
          { k: 'Power', v: `${kw(Math.abs(p))} ${p > 0.5 ? 'discharging' : p < -0.5 ? 'charging' : ''}`.trim() },
          { k: 'SOC', v: `${num(n('SOCPct'), 1)} % (${num(n('kWhAvailable'), 0)} kWh)` },
          { k: 'Cell temp', v: `${num(n('CellTempC'), 1)} °C`, tone: n('CellTempC') > 42 ? 'alarm' : undefined },
          { k: 'Limits', v: `+${num(n('MaxDischargekW'), 0)} / -${num(n('MaxChargekW'), 0)} kW` },
          { k: 'Health (SOH)', v: `${num(n('SOHPct'), 0)} %` },
          { k: 'Throughput', v: `${num(n('ThroughputMWh'), 1)} MWh` },
        ],
      };
    }
    case 'genset':
      return {
        title: 'Genset',
        sub: `${tagStr('Genset/State') || '—'} · 400 kW diesel`,
        rows: [
          { k: 'Output', v: kw(tagNum('Genset/kW')) },
          { k: 'Fuel', v: `${num(tagNum('Genset/FuelPct'), 0)} %`, tone: tagNum('Genset/FuelPct') < 20 ? 'alarm' : undefined },
          { k: 'Start countdown', v: `${num(tagNum('Genset/StartCountdownS'), 0)} s` },
          { k: 'Coolant', v: `${num(tagNum('Genset/CoolantTempC'), 0)} °C` },
          { k: 'Run hours', v: `${num(tagNum('Genset/RunHours'), 0)} h` },
        ],
      };
    case 'evbank':
      return {
        title: 'EV charging bank',
        sub: '10 chargers x 22 kW',
        rows: [
          { k: 'Total', v: kw(tagNum('EV/TotalkW')) },
          { k: 'Sessions', v: num(tagNum('EV/ActiveSessions'), 0) },
          { k: 'Curtailed', v: kw(tagNum('EV/CurtailedkW')), tone: tagNum('EV/CurtailedkW') > 0.5 ? 'warn' : undefined },
        ],
      };
    case 'charger': {
      const st = tagStr(`EV/${t.id}/State`);
      return {
        title: `Charger ${t.id}`,
        sub: st || '—',
        rows: [
          { k: 'Power', v: `${kw(tagNum(`EV/${t.id}/kW`))} of ${num(tagNum(`EV/${t.id}/MaxkW`), 0)} kW`, tone: st === 'FAULT' ? 'alarm' : st === 'CURTAILED' ? 'warn' : undefined },
          { k: 'Car SOC', v: `${num(tagNum(`EV/${t.id}/CarSOCPct`), 0)} % → ${num(tagNum(`EV/${t.id}/TargetSOCPct`), 0)} %` },
          { k: 'Session', v: `${num(tagNum(`EV/${t.id}/SessionkWh`), 1)} kWh` },
          { k: 'Smart charging', v: tagBool(`EV/${t.id}/Smart`) ? 'on' : 'off' },
        ],
      };
    }
    case 'bldg': {
      const total = tagNum(`Loads/Bldg${t.id}/kW`);
      const hvac = tagNum(`Loads/Bldg${t.id}/HVACkW`);
      return {
        title: `Building ${t.id}`,
        sub: `${BLDG_NAME[t.id] ?? ''}${tagBool(`Loads/Bldg${t.id}/Critical`) ? ' · critical load' : ''}`,
        rows: [
          { k: 'Load', v: kw(total) },
          { k: 'HVAC', v: `${kw(hvac)} (${num(total > 0 ? (hvac / total) * 100 : 0, 0)} %)` },
          { k: 'Shed', v: tagBool(`Loads/Bldg${t.id}/Shed`) ? 'yes' : 'no', tone: tagBool(`Loads/Bldg${t.id}/Shed`) ? 'warn' : undefined },
        ],
      };
    }
    default:
      return { title: t.kind, sub: t.id, rows: [] };
  }
}
