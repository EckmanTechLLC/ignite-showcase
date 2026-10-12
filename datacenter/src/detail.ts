import { tagRef } from './live/store';
import { clock, num } from './fmt';
import type { Target } from './selection';

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

const n = (name: string) => {
  const v = tagRef(name).value;
  return typeof v === 'number' ? v : Number.NaN;
};
const s = (name: string) => {
  const v = tagRef(name).value;
  return v === null || v === undefined || v === '' ? '—' : String(v);
};
const b = (name: string) => tagRef(name).value;

/** Live detail rows for a hovered / selected item. Call inside a computed so it tracks the tags it reads. */
export function detailFor(t: Target): Detail {
  switch (t.kind) {
    case 'rack': {
      const p = `Racks/${t.id}/`;
      const inlet = n(p + 'InletTempC');
      const online = b(p + 'Online');
      const row = s(p + 'Row');
      const crah = 'ABCDEF'.indexOf(row) >> 1;
      return {
        title: `Rack ${t.id}`,
        sub: `Row ${row} · ${s(p + 'Workload')} · ${online === false ? 'OFFLINE' : 'online'}`,
        rows: [
          { k: 'Inlet', v: `${num(inlet, 1)} °C`, tone: inlet >= 32 ? 'alarm' : inlet >= 27 ? 'warn' : undefined },
          { k: 'Outlet', v: `${num(n(p + 'OutletTempC'), 1)} °C` },
          { k: 'ΔT', v: `${num(n(p + 'OutletTempC') - inlet, 1)} K` },
          { k: 'Power', v: `${num(n(p + 'PowerKW'), 2)} kW` },
          { k: 'Utilisation', v: `${num(n(p + 'UtilPct'), 0)} %` },
          { k: 'Feeds', v: `${s(p + 'FeedA')} / ${s(p + 'FeedB')}` },
          { k: 'Cooling', v: `CRAH ${crah + 1} (+4)` },
        ],
      };
    }
    case 'crah': {
      const p = `Cooling/CRAH/${t.id}/`;
      const st = s(p + 'State');
      return {
        title: `CRAH ${t.id}`,
        sub: `Zone ${s(p + 'Zone')}`,
        rows: [
          { k: 'State', v: st, tone: st === 'FAULT' ? 'alarm' : st === 'RUN' ? 'ok' : undefined },
          { k: 'Fan', v: `${num(n(p + 'FanPct'), 0)} %` },
          { k: 'Supply', v: `${num(n(p + 'SupplyC'), 1)} °C` },
          { k: 'Return', v: `${num(n(p + 'ReturnC'), 1)} °C` },
          { k: 'Power', v: `${num(n(p + 'KW'), 1)} kW` },
        ],
      };
    }
    case 'chiller': {
      const p = `Cooling/Chiller/${t.id}/`;
      const st = s(p + 'State');
      return {
        title: `Chiller ${t.id}`,
        sub: 'Chilled-water plant',
        rows: [
          { k: 'State', v: st, tone: st === 'RUN' ? 'ok' : st === 'OFF' ? 'alarm' : undefined },
          { k: 'Supply', v: `${num(n(p + 'SupplyC'), 1)} °C` },
          { k: 'Return', v: `${num(n(p + 'ReturnC'), 1)} °C` },
          { k: 'Power', v: `${num(n(p + 'KW'), 0)} kW` },
          { k: 'COP', v: num(n(p + 'COP'), 2) },
        ],
      };
    }
    case 'ups': {
      const p = `Power/UPS/${t.id}/`;
      const st = s(p + 'State');
      return {
        title: `UPS ${t.id}`,
        sub: '500 kW double-conversion',
        rows: [
          { k: 'State', v: st, tone: st === 'ONLINE' ? 'ok' : st === 'BATTERY' ? 'warn' : 'alarm' },
          { k: 'Load', v: `${num(n(p + 'LoadKW'), 0)} kW · ${num(n(p + 'LoadPct'), 0)} %` },
          { k: 'Battery', v: `${num(n(p + 'BatterySOCPct'), 1)} %` },
          { k: 'Runtime', v: `${num(n(p + 'RuntimeMin'), 1)} min`, tone: n(p + 'RuntimeMin') < 10 ? 'alarm' : undefined },
          { k: 'Input / output', v: `${num(n(p + 'InputV'), 0)} / ${num(n(p + 'OutputV'), 0)} V` },
          { k: 'Efficiency', v: `${num(n(p + 'Efficiency'), 1)} %` },
          { k: 'Cabinet', v: `${num(n(p + 'TempC'), 1)} °C` },
        ],
      };
    }
    case 'pdu': {
      const p = `Power/PDU/${t.id}/`;
      const trip = b(p + 'BreakerTripped') === true;
      return {
        title: `PDU ${t.id}`,
        sub: `Fed from ${s(p + 'Feed')}`,
        rows: [
          { k: 'Load', v: `${num(n(p + 'LoadKW'), 1)} kW` },
          { k: 'Load %', v: `${num(n(p + 'LoadPct'), 0)} %`, tone: n(p + 'LoadPct') >= 90 ? 'warn' : undefined },
          { k: 'Breaker', v: trip ? 'TRIPPED' : 'closed', tone: trip ? 'alarm' : 'ok' },
        ],
      };
    }
    case 'utility': {
      const ok = b('Power/Utility/Available') === true;
      return {
        title: 'Utility feed',
        sub: '480 V / 60 Hz service',
        rows: [
          { k: 'Status', v: ok ? 'available' : 'LOST', tone: ok ? 'ok' : 'alarm' },
          { k: 'Voltage', v: `${num(n('Power/Utility/VoltageV'), 0)} V` },
          { k: 'Frequency', v: `${num(n('Power/Utility/FrequencyHz'), 2)} Hz` },
          { k: 'Draw', v: `${num(n('Power/Utility/KW'), 0)} kW` },
        ],
      };
    }
    case 'generator': {
      const st = s('Power/Generator/State');
      return {
        title: 'Generator',
        sub: 'Standby diesel',
        rows: [
          { k: 'State', v: st, tone: st === 'RUNNING' ? 'ok' : st === 'STARTING' ? 'warn' : undefined },
          { k: 'Output', v: `${num(n('Power/Generator/KW'), 0)} kW` },
          { k: 'Fuel', v: `${num(n('Power/Generator/FuelPct'), 1)} %`, tone: n('Power/Generator/FuelPct') < 20 ? 'warn' : undefined },
          { k: 'Run hours', v: num(n('Power/Generator/RunHours'), 0) },
          { k: 'Start in', v: clock(n('Power/Generator/StartCountdownS')) },
        ],
      };
    }
    case 'ats': {
      const pos = s('Power/Switchgear/ATSPosition');
      return {
        title: 'Transfer switch',
        sub: 'Automatic transfer switch',
        rows: [
          { k: 'Position', v: pos, tone: pos === 'UTILITY' ? 'ok' : pos === 'GENERATOR' ? 'warn' : 'alarm' },
          { k: 'Utility', v: b('Power/Utility/Available') === true ? 'available' : 'LOST' },
          { k: 'Generator', v: s('Power/Generator/State') },
        ],
      };
    }
  }
}
