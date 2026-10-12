import { useEffect, useRef, useState } from 'react';
import { readEnv, readTags, subscribe, type ConnectionState } from '@ignite/client';

/**
 * Live value of one tag. `ref` is updated on every batch for per-frame consumers (R3F useFrame);
 * `value` is React state for text readouts.
 */
export function useTag(path: string) {
  const ref = useRef<number | null>(null);
  const [value, setValue] = useState<unknown>(null);
  const [state, setState] = useState<ConnectionState>('connecting');

  useEffect(() => {
    let live = true;
    const apply = (v: unknown) => {
      if (typeof v === 'number') ref.current = v;
      setValue(v);
    };
    readTags([path]).then((r) => live && r.tags[0] && apply(r.tags[0].value)).catch(() => {});
    const sub = subscribe(
      [path],
      (batch) => {
        const u = batch.find((b) => b.path === path || path.endsWith(b.path) || b.path.endsWith(path));
        if (u) apply(u.value);
      },
      { onState: setState },
    );
    return () => {
      live = false;
      sub.close();
    };
  }, [path]);

  return { ref, value, state, env: readEnv() };
}
