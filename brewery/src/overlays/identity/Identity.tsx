import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import Panel from '../Panel';
import { auditProfile, canAdmin, adminBlock, doLogin, doLogout, identity } from '../../identity';
import { fetchAudit, groupByActor, type AuditRow } from './audit';

const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });

export default function Identity() {
  const [name, setName] = createSignal('');
  const [pass, setPass] = createSignal('');
  const [err, setErr] = createSignal('');
  const [working, setWorking] = createSignal(false);
  const [formOpen, setFormOpen] = createSignal(false);
  const tierTitle = () => `Tier from permissions. Security levels: ${identity().levels.length ? identity().levels.join(', ') : 'none'}`;

  async function submit(e: Event): Promise<void> {
    e.preventDefault();
    if (working() || !name() || !pass()) return;
    setWorking(true);
    setErr('');
    try {
      await doLogin(name().trim(), pass());
      setPass('');
      setFormOpen(false);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Login failed.');
    } finally {
      setWorking(false);
    }
  }

  // Audit view: Director tier, last 30 min, every 10 s while the panel is open and the tab visible.
  const [audit, setAudit] = createSignal<AuditRow[]>([]);
  const [auditErr, setAuditErr] = createSignal('');
  const showAudit = () => !!auditProfile && canAdmin();
  createEffect(() => {
    if (!showAudit()) return;
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const rows = await fetchAudit();
        if (!stop) {
          setAudit(rows);
          setAuditErr('');
        }
      } catch (x) {
        if (!stop) setAuditErr(x instanceof Error ? x.message : 'audit failed');
      }
    };
    void load();
    const id = window.setInterval(load, 10_000);
    onCleanup(() => {
      stop = true;
      clearInterval(id);
    });
  });
  const byActor = createMemo(() => groupByActor(audit()));

  return (
    <Panel
      title="Identity"
      hotkey="L"
      head={
        <span class={`chip ${identity().tier.toLowerCase()}`} title={tierTitle()}>
          {identity().method === 'web' ? `Gateway session · ${identity().user} · ` : ''}{identity().tier}
        </span>
      }
    >
      <Show when={identity().method === 'bearer'}>
        <div class="who">
          <div>
            <b>{identity().user}</b>
            <small title={tierTitle()}>{identity().tier} session</small>
          </div>
          <div class="acts">
            <button class="b" onClick={() => void doLogout()}>Log out</button>
            <details>
              <summary>More</summary>
              <button class="b" onClick={() => void doLogout(true)}>Log out everywhere</button>
            </details>
          </div>
        </div>
      </Show>
      <Show when={identity().method === 'web'}>
        <div class="who web">
          <div>
            <small>Gateway session</small>
            <b>{identity().user}</b>
            <small title={tierTitle()}>{identity().tier}</small>
            <p class="note">You are identified by your Ignition gateway login. Tiers come from that account's roles.</p>
          </div>
          <Show when={!formOpen()}>
            <button class="b" onClick={() => setFormOpen(true)}>Log in as a different user</button>
          </Show>
        </div>
      </Show>
      <Show when={identity().method === null || (identity().method === 'web' && formOpen())}>
        <form class="login" onSubmit={submit}>
          <Show when={identity().method === null}>
            <p class="note">Viewer (API key), read-only until you log in. Operator can run the plant and acknowledge alarms; Director also sets scenarios, faults, schedule and speed and sees the audit view.</p>
          </Show>
          <label>
            User
            <input value={name()} onInput={(e) => setName(e.currentTarget.value)} autocomplete="username" spellcheck={false} />
          </label>
          <label>
            Password
            <input value={pass()} onInput={(e) => setPass(e.currentTarget.value)} type="password" autocomplete="current-password" />
          </label>
          <Show when={err()}>
            <p class="err" role="alert">{err()}</p>
          </Show>
          <button class="b" type="submit" disabled={working() || !name() || !pass()}>{working() ? 'Signing in…' : 'Log in'}</button>
          <Show when={identity().method === 'web'}>
            <button class="b" type="button" onClick={() => setFormOpen(false)}>Cancel</button>
          </Show>
        </form>
      </Show>

      <Show when={auditProfile}>
        <h3>Audit <small>last 30 min · every 10 s</small></h3>
        <Show when={canAdmin()} fallback={<p class="note">{adminBlock()}.</p>}>
          <Show when={auditErr()} fallback={<Show when={!audit().length}><p class="note">No audit entries in the last 30 minutes.</p></Show>}>
            <p class="err">{auditErr()}</p>
          </Show>
          <For each={byActor()}>
            {([actor, list]) => (
              <section class="actor">
                <h4>{actor} <i>{list.length}</i></h4>
                <For each={list}>
                  {(r) => (
                    <div class="aud" classList={{ bad: !r.ok }}>
                      <span>{hhmmss(r.time)}</span>
                      <b>{r.action}</b>
                      <em>{r.target}</em>
                      <span class="val">{r.value}</span>
                    </div>
                  )}
                </For>
              </section>
            )}
          </For>
        </Show>
      </Show>
    </Panel>
  );
}
