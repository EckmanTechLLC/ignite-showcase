<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { getAuditLogs } from '@ignite/client';
import Panel from '../Panel.vue';
import { TIER_LABEL, auditProfile, canAdmin, doLogin, doLogout, method, securityLevels, tier, user } from './auth';

const name = ref('');
const pass = ref('');
const err = ref('');
const working = ref(false);
const formOpen = ref(false);
const tierTitle = computed(() => `Tier from permissions. Security levels: ${securityLevels.value.length ? securityLevels.value.join(', ') : 'none'}`);

async function submit(): Promise<void> {
  if (working.value || !name.value || !pass.value) return;
  working.value = true;
  err.value = '';
  try {
    await doLogin(name.value.trim(), pass.value);
    pass.value = '';
    formOpen.value = false;
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Login failed.';
  } finally {
    working.value = false;
  }
}

// --- audit (Director tier, last 30 minutes, every 10 s) ---
interface AuditRow {
  time: number;
  actor: string;
  action: string;
  target: string;
  value: string;
  ok: boolean;
}
const audit = shallowRef<AuditRow[]>([]);
const auditErr = ref('');
const showAudit = computed(() => !!auditProfile && canAdmin.value);

async function loadAudit(): Promise<void> {
  if (!showAudit.value || document.hidden) return;
  try {
    const r = (await getAuditLogs({ auditProfile, startDate: Date.now() - 30 * 60_000 })) as { result?: Record<string, unknown>[] };
    audit.value = (r.result ?? [])
      .map((x) => ({
        time: Number(x['Timestamp']),
        actor: String(x['Actor'] ?? '—'),
        action: String(x['Action'] ?? ''),
        target: String(x['Action Target'] ?? ''),
        value: String(x['Action Value'] ?? ''),
        ok: Number(x['Result Code'] ?? 0) === 0,
      }))
      .sort((a, b) => b.time - a.time);
    auditErr.value = '';
  } catch (e) {
    auditErr.value = e instanceof Error ? e.message : 'audit failed';
  }
}
const byActor = computed(() => {
  const m = new Map<string, AuditRow[]>();
  for (const r of audit.value) (m.get(r.actor) ?? m.set(r.actor, []).get(r.actor)!).push(r);
  return [...m.entries()].sort((a, b) => b[1][0].time - a[1][0].time);
});

watch(showAudit, () => void loadAudit());
let timer = 0;
onMounted(() => {
  void loadAudit();
  timer = window.setInterval(loadAudit, 10_000);
});
onBeforeUnmount(() => clearInterval(timer));
const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });
</script>

<template>
  <Panel title="Identity" hotkey="L">
    <template #head><span class="chip" :class="tier" :title="tierTitle">{{ method === 'web' ? `Gateway session · ${user} · ` : '' }}{{ TIER_LABEL[tier] }}</span></template>

    <div v-if="method === 'bearer'" class="who">
      <div><b>{{ user }}</b><small :title="tierTitle">{{ TIER_LABEL[tier] }} session</small></div>
      <div class="acts">
        <button @click="doLogout()">Log out</button>
        <details><summary>More</summary><button @click="doLogout(true)">Log out everywhere</button></details>
      </div>
    </div>
    <div v-else-if="method === 'web'" class="who web">
      <div>
        <small>Gateway session</small><b>{{ user }}</b><small :title="tierTitle">{{ TIER_LABEL[tier] }}</small>
        <p class="note">You are identified by your Ignition gateway login. Tiers come from that account's roles.</p>
      </div>
      <button v-if="!formOpen" @click="formOpen = true">Log in as a different user</button>
    </div>
    <form v-if="method === null || (method === 'web' && formOpen)" class="login" @submit.prevent="submit">
      <p v-if="method === null" class="note">Viewer (API key), read-only until you log in. Operator can acknowledge and run scenarios; Director also sets speed and the raw scenario and sees the audit view.</p>
      <label>User<input v-model="name" autocomplete="username" spellcheck="false" /></label>
      <label>Password<input v-model="pass" type="password" autocomplete="current-password" /></label>
      <p v-if="err" class="err" role="alert">{{ err }}</p>
      <button type="submit" :disabled="working || !name || !pass">{{ working ? 'Signing in…' : 'Log in' }}</button>
      <button v-if="method === 'web'" type="button" @click="formOpen = false">Cancel</button>
    </form>

    <template v-if="auditProfile">
      <h3>Audit <small>last 30 min &middot; every 10 s</small></h3>
      <p v-if="!canAdmin" class="note">Director tier required.</p>
      <template v-else>
        <p v-if="auditErr" class="err">{{ auditErr }}</p>
        <p v-else-if="!audit.length" class="note">No audit entries in the last 30 minutes.</p>
        <section v-for="[actor, list] in byActor" :key="actor" class="actor">
          <h4>{{ actor }} <i>{{ list.length }}</i></h4>
          <div v-for="(r, i) in list" :key="i" class="line" :class="{ bad: !r.ok }">
            <span>{{ hhmmss(r.time) }}</span><b>{{ r.action }}</b><em>{{ r.target }}</em><span class="val">{{ r.value }}</span>
          </div>
        </section>
      </template>
    </template>
  </Panel>
</template>

<style scoped>
.chip { padding: 1px 10px; border-radius: 10px; background: var(--bg-3); color: var(--fg-1); font-size: var(--text-xs); letter-spacing: 0.06em; }
.chip.operator { color: var(--ok); } .chip.director { color: var(--feed-b); } .chip.viewer { color: var(--info); }
.who { display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) var(--space-3); background: var(--bg-2); border-radius: var(--radius-3); }
.who b { color: var(--fg-0); display: block; } .who small { color: var(--fg-2); }
.who.web { display: grid; gap: var(--space-2); justify-content: stretch; }
.acts { display: grid; gap: 4px; justify-items: end; } .acts summary { color: var(--fg-2); font-size: var(--text-xs); cursor: pointer; }
.login { display: grid; gap: var(--space-2); }
label { display: grid; gap: 2px; color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.06em; }
input { font: 500 var(--text-sm) var(--font-mono); background: var(--bg-2); color: var(--fg-0); border: 1px solid var(--line-strong); border-radius: var(--radius-2); padding: 6px 8px; }
input:focus { outline: 1px solid var(--accent); }
button { font: 600 var(--text-xs) var(--font-mono); letter-spacing: 0.04em; color: var(--accent); background: var(--bg-2); border: 1px solid var(--accent); border-radius: var(--radius-2); padding: 6px 14px; cursor: pointer; justify-self: start; }
button:hover:not(:disabled) { background: var(--accent-dim); }
button:disabled { color: var(--fg-2); border-color: var(--line-strong); cursor: not-allowed; }
.note { margin: 0; color: var(--fg-2); font-size: var(--text-xs); }
.err { margin: 0; color: var(--alarm); }
h3 { margin: var(--space-5) 0 var(--space-2); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-0); }
h3 small { color: var(--fg-2); text-transform: none; letter-spacing: 0; margin-left: 6px; }
h4 { margin: var(--space-3) 0 2px; color: var(--accent); font-size: var(--text-sm); }
h4 i { font-style: normal; color: var(--fg-2); font-size: var(--text-xs); }
.line { display: grid; grid-template-columns: 64px 110px 1fr auto; gap: 8px; font-size: 11px; padding: 2px 0; border-top: 1px solid var(--line); }
.line b { color: var(--fg-0); font-weight: 500; } .line em { font-style: normal; color: var(--fg-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line .val { color: var(--fg-2); } .line.bad .val { color: var(--alarm); }
</style>
