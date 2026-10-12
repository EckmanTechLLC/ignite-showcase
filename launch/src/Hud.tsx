import type { ConnectionState } from '@ignite/client';

interface Props {
  gatewayUrl: string;
  site: string;
  state: ConnectionState;
  path: string;
  value: unknown;
}

export function Hud({ gatewayUrl, site, state, path, value }: Props) {
  return (
    <header className="hud mono">
      <span className="title">Launch Operations</span>
      <span>gateway <b>{gatewayUrl || 'same-origin'}</b></span>
      <span>site <b>{site || '-'}</b></span>
      <span><i className={`dot ${state}`} />sse <b>{state}</b></span>
      <span>{path} <b className="value">{value === null || value === undefined ? '-' : String(value)}</b></span>
    </header>
  );
}
