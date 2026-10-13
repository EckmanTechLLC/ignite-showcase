import { rawStr, tagStr } from './live/store';

/** Names used across the plant, strip and HUD. Everything else is read straight from the tag names. */
export const RECIPES = ['Pilsner', 'IPA', 'Stout', 'Wheat'] as const;
export const FVS = Array.from({ length: 12 }, (_, i) => `FV${String(i + 1).padStart(2, '0')}`);
export const BBTS = ['BBT1', 'BBT2', 'BBT3', 'BBT4'];
export const SLOTS = Array.from({ length: 24 }, (_, i) => `B${String(i + 1).padStart(2, '0')}`);
export const MACHINES = ['Depal', 'Rinser', 'Filler', 'Seamer', 'Pasteurizer', 'Labeler', 'Packer', 'Palletizer'] as const;
export const MACHINE_LABEL: Record<string, string> = {
  Depal: 'Depalletizer', Rinser: 'Rinser', Filler: 'Filler', Seamer: 'Seamer', Pasteurizer: 'Pasteurizer', Labeler: 'Labeler', Packer: 'Packer', Palletizer: 'Palletizer',
};
export const CASES_PER_PALLET = 48;

const FALLBACK = '#9aa7b8';
/** Recipe colour from BR/Recipes/<name>/Color (tracked when called inside a component or memo). */
export const recipeColor = (recipe: string): string => (recipe ? tagStr(`Recipes/${recipe}/Color`) || FALLBACK : FALLBACK);
/** Same, untracked, for the render loop. */
export const recipeColorRaw = (recipe: string): string => (recipe ? rawStr(`Recipes/${recipe}/Color`) || FALLBACK : FALLBACK);

/** Batch phases (timeline names) grouped the way the strip shows them. */
export const PHASE_GROUPS = [
  { key: 'Mash', phases: ['MILLING', 'MASH'] },
  { key: 'Lauter', phases: ['LAUTER'] },
  { key: 'Boil', phases: ['BOIL'] },
  { key: 'Whirlpool', phases: ['WHIRLPOOL'] },
  { key: 'Knock-out', phases: ['KNOCKOUT'] },
  { key: 'Fermentation', phases: ['FERMENTATION', 'DIACETYL_REST', 'CRASH'] },
  { key: 'Conditioning', phases: ['CONDITIONING', 'TRANSFER', 'CARBONATING', 'READY'] },
  { key: 'Packaging', phases: ['PACKAGING'] },
] as const;
export const groupIndex = (phase: string): number => PHASE_GROUPS.findIndex((g) => (g.phases as readonly string[]).includes(phase));

/** Batch states that are not on the strip. */
export const INACTIVE_STATES = new Set(['PLANNED', 'COMPLETE', 'DUMPED']);

export const MODE_TONE: Record<string, string> = { NORMAL: 'ok', BREW_DAY: 'ok', RUSH: 'info', CELLAR_RISK: 'warn', LINE_DOWN: 'alarm', QA_HOLD: 'alarm' };
