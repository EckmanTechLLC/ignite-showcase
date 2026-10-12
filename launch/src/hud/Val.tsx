import { useTagValue } from '../live/hooks';
import type { TagName } from '../live/paths';
import { fmtNum, unitOf } from './format';

/** A live number with its unit from the tag model (generated units.ts). */
export function Val({ tag, digits = 1, unit, scale = 1 }: { tag: TagName; digits?: number; unit?: string; scale?: number }) {
  const v = useTagValue(tag);
  const n = typeof v === 'number' ? v * scale : v;
  const u = unit ?? unitOf(tag);
  return (
    <span className="val">
      <b>{fmtNum(n, digits)}</b>
      {u && <i>{u}</i>}
    </span>
  );
}
