import { writeBlock } from '../../identity';
import { tagStr } from '../../live/store';
import { SLOTS } from '../../model';
import { busy, run } from './brew';

/** Slot of a batch id ("BR0007" -> "B07"), '' when it is not in the ring. */
export const slotOf = (id: string): string => SLOTS.find((s) => tagStr(`Batches/${s}/Id`) === id) ?? '';

/** QA release (batch on HOLD) and dump (beer in a tank). Write tier; the reason shows as the tooltip when disabled. */
export default function QaButtons(p: { batch: string }) {
  const slot = () => slotOf(p.batch);
  const qa = () => tagStr(`Batches/${slot()}/QAStatus`);
  const state = () => tagStr(`Batches/${slot()}/State`);
  const inTank = () => !!slot() && !['PLANNED', 'COMPLETE', 'DUMPED'].includes(state()) && (tagStr(`Batches/${slot()}/FV`) !== '' || tagStr(`Batches/${slot()}/BBT`) !== '');
  const relBlock = () => writeBlock() || (!slot() ? 'Select a batch' : qa() !== 'HOLD' ? 'Only a batch on QA HOLD can be released' : '');
  const dumpBlock = () => writeBlock() || (!slot() ? 'Select a batch' : !inTank() ? 'Only beer that is in a tank can be dumped' : '');
  return (
    <div class="line">
      <button class="b" disabled={!!relBlock() || busy()} title={relBlock() || `Release ${p.batch} from HOLD`} onClick={() => void run('qa_release', [p.batch])}>
        QA release
      </button>
      <button class="b danger" disabled={!!dumpBlock() || busy()} title={dumpBlock() || `Dump ${p.batch} (QA FAIL, tank to CIP)`} onClick={() => void run('qa_dump', [p.batch])}>
        QA dump
      </button>
    </div>
  );
}
