import { useState, type FormEvent } from 'react';
import { Panel } from '../Panel';
import { auditProfile, useAuditTail } from './audit';
import { signIn, signOut, useSession } from './session';

function AuditTicker() {
  const { lines, error } = useAuditTail(true);
  return (
    <>
      <h3>Audit (last 15 min)</h3>
      {error && <p className="note bad">Audit feed: {error}</p>}
      <ul className="audit">
        {lines.length === 0 && !error && <li className="empty">No audit events.</li>}
        {lines.map((l, i) => (
          <li key={`${l.at}-${i}`}>
            <span className="muted mono">{new Date(l.at).toLocaleTimeString([], { hour12: false })}</span>
            <b>{l.actor || '-'}</b>
            <span>{l.action}</span>
            <span className="muted">
              {l.target}
              {l.value ? ` · ${l.value}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function IdentityPanel() {
  const session = useSession();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const msg = await signIn(user.trim(), pass);
    setBusy(false);
    setErr(msg);
    if (!msg) setPass('');
  };

  return (
    <Panel id="identity" title="Identity" hint="L">
      {session.loggedIn ? (
        <div className="who">
          <p>
            <b>{session.user}</b> <span className={`tier tier-${session.tier}`}>{session.tier}</span>
          </p>
          <p className="muted">
            {session.canAdmin ? 'Scenario, speed and fault controls; audit ticker.' : session.canWrite ? 'Sequencer commands and alarm acknowledge.' : 'Read-only access.'}
          </p>
          <button type="button" className="btn" onClick={() => void signOut()}>
            Log out
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="login">
          <p className="muted">Viewing as <b>Viewer</b>. Log in for Operator or Director controls.</p>
          <label>
            Username
            <input className="inp" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Password
            <input className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
          </label>
          {err && (
            <p className="note bad" role="alert">
              {err}
            </p>
          )}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Signing in...' : 'Log in'}
          </button>
        </form>
      )}
      {session.canAdmin && (auditProfile() ? <AuditTicker /> : <p className="note">Audit ticker hidden: the site has no IGNITE_AUDIT_PROFILE.</p>)}
    </Panel>
  );
}
