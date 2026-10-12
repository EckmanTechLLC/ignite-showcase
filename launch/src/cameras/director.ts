import type { PresetId } from './presets';

/**
 * Which shot the auto-director wants for the current sequencer state. Pure function of the tags so it
 * is easy to reason about: clock events pick the shot during the count, flight events during ascent.
 */
export function directedPreset(phase: string, tMinus: number, meco: boolean): PresetId {
  switch (phase) {
    case 'ABORT':
      return 'pad';
    case 'IGNITION':
      return 'padLow';
    case 'LIFTOFF':
    case 'ASCENT':
      return meco ? 'range' : 'chase';
    case 'ORBIT':
    case 'SAFING':
    case 'RECYCLE':
    case 'IDLE':
    case 'CHILLDOWN':
    case 'LOADING':
      return 'range';
    default:
      // HOLD and TERMINAL_COUNT: shots keyed on the countdown
      if (tMinus >= -10) return 'padLow'; // T-0:10: low angle on the pad
      if (tMinus >= -40) return 'trench'; // T-0:40: into the flame trench
      if (tMinus >= -420) return 'tower'; // T-7:00: strongback starts to retract
      if (tMinus >= -600) return 'tank'; // T-10:00 hold: tank farm
      return 'range';
  }
}
