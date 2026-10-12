import { computed } from 'vue';
import { useTagBool, useTagNumber, useTagString } from '../live/store';

// Derived power-chain state shared by the left panel and the hall busways.

export const utilityAvailable = useTagBool('Power/Utility/Available');
export const utilityKW = useTagNumber('Power/Utility/KW');
export const atsPosition = useTagString('Power/Switchgear/ATSPosition');
export const genState = useTagString('Power/Generator/State');
export const genKW = useTagNumber('Power/Generator/KW');

/** Dash speed (px/s) for a load in kW. */
export const flowSpeed = (kw: number) => (Number.isFinite(kw) ? Math.min(110, 10 + kw * 0.2) : 0);

export const utilityPathLive = computed(() => utilityAvailable.value === true && atsPosition.value === 'UTILITY' && utilityKW.value > 0.5);
export const genPathLive = computed(() => atsPosition.value === 'GENERATOR' && genKW.value > 0.5);
/** Power reaches the UPS inputs through a closed ATS. */
export const atsLive = computed(() => utilityPathLive.value || genPathLive.value);

export function useUps(letter: 'A' | 'B') {
  const p = `Power/UPS/${letter}/`;
  const state = useTagString(p + 'State');
  const loadKW = useTagNumber(p + 'LoadKW');
  const loadPct = useTagNumber(p + 'LoadPct');
  const soc = useTagNumber(p + 'BatterySOCPct');
  const runtime = useTagNumber(p + 'RuntimeMin');
  const outputLive = computed(() => (state.value === 'ONLINE' || state.value === 'BATTERY' || state.value === 'BYPASS') && loadKW.value > 0.5);
  const inputLive = computed(() => (state.value === 'ONLINE' || state.value === 'BYPASS') && atsLive.value);
  return { state, loadKW, loadPct, soc, runtime, outputLive, inputLive };
}
export const upsA = useUps('A');
export const upsB = useUps('B');

export function usePdu(feed: 'A' | 'B', n: number) {
  const p = `Power/PDU/${feed}${n}/`;
  const loadKW = useTagNumber(p + 'LoadKW');
  const loadPct = useTagNumber(p + 'LoadPct');
  const tripped = useTagBool(p + 'BreakerTripped');
  const upstream = feed === 'A' ? upsA : upsB;
  const live = computed(() => tripped.value !== true && upstream.outputLive.value && loadKW.value > 0.05);
  return { loadKW, loadPct, tripped, live };
}
export const pdus = {
  A: [1, 2, 3].map((n) => usePdu('A', n)),
  B: [1, 2, 3].map((n) => usePdu('B', n)),
};
