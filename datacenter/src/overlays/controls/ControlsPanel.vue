<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Panel from '../Panel.vue';
import { adminBlock, canAdmin, canWrite, writeBlock } from '../identity/auth';
import { useTagNumber, useTagString } from '../../live/store';
import { num } from '../../fmt';
import { busy, refreshStatus, run, status } from './dc';

const mode = useTagString('Hall/Mode');
const scenario = useTagString('_Sim_/Scenario');
const speed = useTagNumber('_Sim_/SpeedFactor');
const pretty = (s: string) => (s ? s.replace(/_/g, ' ').toUpperCase() : '—');

const crahN = ref(2);
const confirmRestore = ref(false);
const profile = computed(() => status.value?.workload_profile ?? '');
const rawScenario = ref('normal');

// Gate on the state when it is known, on the tier always. Returns the reason, or '' when allowed.
const why = (tierBlock: string, stateBlock = ''): string => tierBlock || (busy.value ? 'Working…' : stateBlock);
const st = computed(() => status.value);
const utilityUp = computed(() => st.value?.utility_available ?? true);
const crahState = computed(() => st.value?.crah?.[String(crahN.value)] ?? 'RUN');
const migrating = computed(() => st.value?.scenario === 'rack_migration');
const dirty = computed(() => !!st.value && (st.value.scenario !== 'normal' || st.value.faults.crah !== 0 || st.value.faults.utility_out));

let timer = 0;
onMounted(() => {
  void refreshStatus();
  timer = window.setInterval(() => !document.hidden && void refreshStatus(), 5000);
});
onBeforeUnmount(() => clearInterval(timer));

function restore(): void {
  if (!confirmRestore.value) {
    confirmRestore.value = true;
    window.setTimeout(() => (confirmRestore.value = false), 4000);
    return;
  }
  confirmRestore.value = false;
  void run('restore');
}
</script>

<template>
  <Panel title="Controls" hotkey="C">
    <template #head>
      <span class="chip" title="Hall/Mode">{{ pretty(mode) }}</span>
      <span class="chip" title="Scenario">{{ pretty(scenario) }}</span>
      <span class="chip" title="Speed factor">{{ num(speed, 2).replace(/\.?0+$/, '') }}&times;</span>
    </template>

    <p v-if="!canWrite" class="note">{{ writeBlock }}. Anonymous and Viewer sessions are read-only.</p>

    <h3>Power</h3>
    <div class="grid">
      <button :disabled="!!why(writeBlock, utilityUp ? '' : 'Utility already lost')" :title="why(writeBlock, utilityUp ? '' : 'Utility already lost') || 'Drop the utility feed'" @click="run('utility_loss')">Utility loss</button>
      <button :disabled="!!why(writeBlock, utilityUp ? 'Utility is available' : '')" :title="why(writeBlock, utilityUp ? 'Utility is available' : '') || 'Return the utility feed'" @click="run('utility_restore')">Utility restore</button>
    </div>

    <h3>Cooling</h3>
    <div class="grid">
      <label class="pick">CRAH
        <select v-model.number="crahN"><option v-for="n in 4" :key="n" :value="n">{{ n }}</option></select>
        <i :class="{ bad: crahState === 'FAULT' }">{{ crahState }}</i>
      </label>
      <button :disabled="!!why(writeBlock, crahState === 'FAULT' ? 'CRAH already failed' : '')" :title="why(writeBlock, crahState === 'FAULT' ? 'CRAH already failed' : '') || 'Put the unit into FAULT'" @click="run('fail_crah', [crahN])">Fail CRAH {{ crahN }}</button>
      <button :disabled="!!why(writeBlock, crahState === 'FAULT' ? '' : 'CRAH is not failed')" :title="why(writeBlock, crahState === 'FAULT' ? '' : 'CRAH is not failed') || 'Bring the unit back'" @click="run('restore_crah', [crahN])">Restore CRAH {{ crahN }}</button>
    </div>

    <h3>Load</h3>
    <div class="grid">
      <button :disabled="!!why(writeBlock, migrating ? 'Migration already running' : '')" :title="why(writeBlock, migrating ? 'Migration already running' : '') || 'Move load from rows A-B to E-F'" @click="run('start_migration')">Start migration</button>
      <label class="pick">Profile
        <select :value="profile || 'diurnal'" :disabled="!!why(writeBlock)" :title="why(writeBlock)" @change="run('set_workload_profile', [($event.target as HTMLSelectElement).value])">
          <option value="diurnal">diurnal</option><option value="flat">flat</option><option value="bursty">bursty</option>
        </select>
      </label>
    </div>

    <h3>Reset</h3>
    <div class="grid">
      <button class="danger" :disabled="!!why(writeBlock, dirty ? '' : 'Nothing to restore')" :title="why(writeBlock, dirty ? '' : 'Nothing to restore') || 'Clear faults, reset breakers, scenario normal'" @click="restore">
        {{ confirmRestore ? 'Confirm: restore all' : 'Restore all' }}
      </button>
    </div>

    <h3>Director <small v-if="adminBlock">{{ adminBlock }}</small></h3>
    <div class="grid">
      <div class="seg" role="group" aria-label="Simulation speed">
        <button v-for="f in [0.5, 1, 2, 4]" :key="f" :class="{ on: st?.speed === f }" :disabled="!canAdmin || busy" :title="adminBlock" @click="run('set_speed', [f])">{{ f }}&times;</button>
      </div>
      <label class="pick">Scenario
        <select v-model="rawScenario" :disabled="!canAdmin">
          <option>normal</option><option>utility_loss</option><option>crah_failure</option><option>rack_migration</option>
        </select>
        <button :disabled="!canAdmin || busy" :title="adminBlock || 'dc.set_scenario'" @click="run('set_scenario', [rawScenario])">Set</button>
      </label>
    </div>

    <dl v-if="st" class="state">
      <dt>ATS</dt><dd>{{ st.ats }}</dd>
      <dt>Faults</dt><dd>utility {{ st.faults.utility_out ? 'out' : 'ok' }}, CRAH {{ st.faults.crah || 'none' }}</dd>
      <dt>Alarms</dt><dd>{{ st.active_alarms }}</dd>
      <dt v-if="st.last_error">Last error</dt><dd v-if="st.last_error" class="bad">{{ st.last_error }}</dd>
    </dl>
  </Panel>
</template>

<style scoped>
.chip { padding: 1px 8px; border-radius: 10px; background: var(--bg-3); color: var(--fg-0); font-size: var(--text-xs); letter-spacing: 0.04em; }
h3 { margin: var(--space-4) 0 var(--space-2); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-2); }
h3 small { color: var(--warn); letter-spacing: 0; text-transform: none; margin-left: 6px; }
.note { margin: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--warn); border-radius: var(--radius-2); color: var(--warn); }
.grid { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
button { font: 600 var(--text-xs) var(--font-mono); letter-spacing: 0.04em; color: var(--accent); background: var(--bg-2); border: 1px solid var(--accent); border-radius: var(--radius-2); padding: 6px 12px; cursor: pointer; }
button:hover:not(:disabled) { background: var(--accent-dim); }
button:disabled { color: var(--fg-2); border-color: var(--line-strong); cursor: not-allowed; }
button.danger { color: var(--alarm); border-color: var(--alarm); }
button.danger:disabled { color: var(--fg-2); border-color: var(--line-strong); }
button.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--alarm) 25%, transparent); }
.pick { display: inline-flex; align-items: center; gap: 6px; color: var(--fg-1); font-size: var(--text-xs); }
select { font: 500 var(--text-xs) var(--font-mono); background: var(--bg-2); color: var(--fg-0); border: 1px solid var(--line-strong); border-radius: var(--radius-2); padding: 4px 6px; }
.pick i { font-style: normal; color: var(--ok); }
.pick i.bad, .bad { color: var(--alarm); }
.seg { display: inline-flex; }
.seg button { border-radius: 0; margin-left: -1px; }
.seg button.on { background: var(--accent-dim); color: var(--fg-0); }
.state { display: grid; grid-template-columns: 80px 1fr; gap: 2px 8px; margin: var(--space-4) 0 0; font-size: var(--text-xs); color: var(--fg-2); }
.state dt { color: var(--fg-2); } .state dd { margin: 0; color: var(--fg-0); }
</style>
