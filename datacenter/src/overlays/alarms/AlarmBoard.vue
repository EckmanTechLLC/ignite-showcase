<script setup lang="ts">
import { computed, ref } from 'vue';
import Panel from '../Panel.vue';
import { writeBlock, canWrite } from '../identity/auth';
import { tagRef } from '../../live/store';
import { unitOf, num } from '../../fmt';
import {
  GROUP_ORDER, PRIORITY_RANK, acknowledge, activeRows, alarmError, rows, samples, stormOf, type Row,
} from './store';

type Filter = 'active' | 'unacked' | 'all';
const filter = ref<Filter>('active');
const busy = ref(false);

const visible = computed(() =>
  rows.value.filter((r) => (filter.value === 'active' ? r.active : filter.value === 'unacked' ? !r.acked : true)),
);
const groups = computed(() => {
  const m = new Map<string, Row[]>();
  for (const r of visible.value) (m.get(r.group) ?? m.set(r.group, []).get(r.group)!).push(r);
  return [...m.entries()]
    .sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]))
    .map(([name, list]) => ({
      name,
      list: [...list].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.activeMs - a.activeMs),
    }));
});
const needAck = (list: Row[]) => list.filter((r) => !r.acked).map((r) => r.id);
const allNeeding = computed(() => needAck(visible.value));

async function ack(ids: string[]): Promise<void> {
  busy.value = true;
  try {
    await acknowledge(ids);
  } finally {
    busy.value = false;
  }
}

const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });
const since = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;
};
function valueOf(tag: string): string {
  const v = tagRef(tag).value;
  if (v === null) return '—';
  return typeof v === 'number' ? `${num(v, v >= 100 ? 0 : 1)} ${unitOf(tag)}`.trim() : String(v);
}

const storm = computed(() => stormOf(rows.value));
const offset = (ms: number | null) => {
  if (ms === null || !storm.value?.firstHigh) return '';
  const s = Math.round((ms - storm.value.firstHigh) / 1000);
  return s <= 0 ? '' : `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const spark = computed(() => {
  const s = samples.value;
  const now = Date.now();
  const W = 220;
  const H = 36;
  if (s.length < 2) return { line: '', crit: '', max: 0 };
  const max = Math.max(1, ...s.map((p) => p.n));
  const pt = (p: { t: number }, v: number) => `${(((p.t - (now - 15 * 60_000)) / (15 * 60_000)) * W).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`;
  return { line: s.map((p) => pt(p, p.n)).join(' '), crit: s.map((p) => pt(p, p.crit)).join(' '), max };
});
</script>

<template>
  <Panel title="Alarms" hotkey="A">
    <template #head>
      <button v-for="f in (['active', 'unacked', 'all'] as const)" :key="f" class="pill" :class="{ on: filter === f }" @click="filter = f">
        {{ f === 'active' ? 'Active' : f === 'unacked' ? 'Needs ack' : 'All events' }}
      </button>
    </template>

    <div class="storm">
      <div class="st-head">
        <span>STORM TIMELINE</span>
        <span class="count" :class="{ hot: activeRows.length }">{{ activeRows.length }} active</span>
      </div>
      <ol v-if="storm" class="steps">
        <li :class="{ done: storm.firstHigh }"><b class="dot warn" />First High<span>{{ storm.firstHigh ? hhmmss(storm.firstHigh) : '—' }}</span><em>{{ storm.first?.label }}</em></li>
        <li :class="{ done: storm.firstCritical }"><b class="dot alarm" />First Critical<span>{{ storm.firstCritical ? hhmmss(storm.firstCritical) : 'none' }}</span><em>{{ offset(storm.firstCritical) }}</em></li>
        <li :class="{ done: storm.cleared }"><b class="dot ok" />{{ storm.cleared ? 'All clear' : 'Still active' }}<span>{{ storm.cleared ? hhmmss(storm.cleared) : '—' }}</span><em>{{ offset(storm.cleared) }} &middot; {{ storm.events }} events</em></li>
      </ol>
      <div v-else class="empty">No High or Critical event on record.</div>
      <svg class="spark" viewBox="0 0 220 36" preserveAspectRatio="none" role="img" aria-label="Active alarm count, last 15 minutes">
        <polyline :points="spark.line" class="l" />
        <polyline :points="spark.crit" class="c" />
      </svg>
      <div class="sub">active count, last 15 min (peak {{ spark.max }}; red = Critical)</div>
    </div>

    <div class="bar">
      <span v-if="alarmError" class="err">{{ alarmError }}</span>
      <span v-else>{{ visible.length }} shown</span>
      <button class="act" :disabled="!canWrite || !allNeeding.length || busy" :title="writeBlock || (allNeeding.length ? 'Acknowledge every visible alarm' : 'Nothing to acknowledge')" @click="ack(allNeeding)">
        Acknowledge all visible ({{ allNeeding.length }})
      </button>
    </div>
    <p v-if="!canWrite" class="hint">{{ writeBlock }} &mdash; acknowledge needs the Operator tier.</p>

    <div v-if="!groups.length" class="empty">{{ filter === 'active' ? 'No active alarms.' : 'Nothing to show.' }}</div>
    <section v-for="g in groups" :key="g.name" class="grp">
      <h3>
        {{ g.name }} <i>{{ g.list.length }}</i>
        <button class="act sm" :disabled="!canWrite || !needAck(g.list).length || busy" :title="writeBlock || 'Acknowledge this group'" @click="ack(needAck(g.list))">Ack group</button>
      </h3>
      <div v-for="r in g.list" :key="r.id" class="row" :class="[r.priority.toLowerCase(), { cleared: !r.active }]">
        <i class="pri" :title="r.priority" />
        <div class="main">
          <b>{{ r.label }}</b>
          <small>{{ r.tag }}</small>
        </div>
        <span class="state">{{ r.active ? (r.acked ? 'Active, acked' : 'Active') : 'Cleared, unacked' }}</span>
        <span class="val">{{ valueOf(r.tag) }}</span>
        <span class="age" :title="new Date(r.activeMs).toLocaleString()">{{ since(r.activeMs) }}</span>
        <button class="act sm" :disabled="!canWrite || r.acked || busy" :title="writeBlock || (r.acked ? 'Already acknowledged' : 'Acknowledge')" @click="ack([r.id])">Ack</button>
      </div>
    </section>
  </Panel>
</template>

<style scoped>
.pill { font: 500 var(--text-xs) var(--font-mono); color: var(--fg-1); background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: 10px; padding: 1px 9px; cursor: pointer; }
.pill.on { color: var(--accent); border-color: var(--accent); }
.storm { border: 1px solid var(--line); border-radius: var(--radius-3); padding: var(--space-2) var(--space-3); background: var(--bg-2); margin-bottom: var(--space-3); }
.st-head { display: flex; justify-content: space-between; color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.1em; margin-bottom: 4px; }
.count.hot { color: var(--alarm); font-weight: 700; }
.steps { list-style: none; margin: 0 0 6px; padding: 0; display: grid; gap: 3px; }
.steps li { display: grid; grid-template-columns: 14px 110px 70px 1fr; align-items: center; gap: 6px; opacity: 0.5; }
.steps li.done { opacity: 1; }
.steps span { color: var(--fg-0); }
.steps em { color: var(--fg-2); font-style: normal; font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.dot.warn { background: var(--warn); } .dot.alarm { background: var(--alarm); } .dot.ok { background: var(--ok); }
.spark { width: 100%; height: 36px; display: block; background: var(--bg-1); border-radius: var(--radius-2); }
.spark polyline { fill: none; vector-effect: non-scaling-stroke; stroke-width: 1.5; }
.spark .l { stroke: var(--warn); } .spark .c { stroke: var(--alarm); }
.sub { font-size: var(--text-xs); color: var(--fg-2); margin-top: 2px; }
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
.err { color: var(--alarm); }
.hint { margin: 0 0 var(--space-2); color: var(--warn); font-size: var(--text-xs); }
.empty { color: var(--fg-2); padding: var(--space-3) 0; }
.act { font: 600 var(--text-xs) var(--font-mono); letter-spacing: 0.04em; color: var(--accent); background: var(--bg-2); border: 1px solid var(--accent); border-radius: var(--radius-2); padding: 3px 10px; cursor: pointer; }
.act.sm { padding: 1px 8px; }
.act:hover:not(:disabled) { background: var(--accent-dim); }
.act:disabled { color: var(--fg-2); border-color: var(--line-strong); cursor: not-allowed; }
.grp h3 { margin: var(--space-3) 0 4px; font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-0); display: flex; align-items: center; gap: 8px; }
.grp h3 i { font-style: normal; color: var(--fg-2); flex: 1; }
.row { display: grid; grid-template-columns: 6px 1fr 96px 74px 34px auto; gap: 8px; align-items: center; padding: 4px 0; border-top: 1px solid var(--line); }
.row.cleared { opacity: 0.65; }
.pri { width: 6px; height: 26px; border-radius: 2px; background: var(--fg-2); }
.critical .pri { background: var(--alarm); box-shadow: 0 0 8px var(--alarm); } .high .pri { background: var(--warn); } .medium .pri { background: var(--info); }
.main { min-width: 0; display: flex; flex-direction: column; }
.main b { color: var(--fg-0); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.main small { color: var(--fg-2); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.state { font-size: 10px; color: var(--fg-2); }
.val { text-align: right; color: var(--fg-0); }
.age { color: var(--fg-2); text-align: right; }
</style>
