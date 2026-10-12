import { useAlarms } from './store';

/** Count of active Launch alarms; pulses while any Critical alarm is active. */
export function AlarmBadge() {
  const { activeCount, criticalActive, unackedCount } = useAlarms();
  if (activeCount === 0 && unackedCount === 0) return null;
  return (
    <b className={`badge ${criticalActive ? 'crit' : activeCount ? 'act' : 'idle'}`} title={`${activeCount} active, ${unackedCount} unacknowledged`}>
      {activeCount || unackedCount}
    </b>
  );
}
