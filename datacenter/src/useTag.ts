import { onBeforeUnmount, ref } from 'vue';
import { readEnv, readTags, subscribe, type ConnectionState } from '@ignite/client';

/** Reactive live value of one tag; updates arrive as one batch per animation frame. */
export function useTag(path: string) {
  const value = ref<unknown>(null);
  const state = ref<ConnectionState>('connecting');
  let live = true;

  readTags([path])
    .then((r) => live && r.tags[0] && (value.value = r.tags[0].value))
    .catch(() => {});
  const sub = subscribe(
    [path],
    (batch) => {
      const u = batch.find((b) => b.path === path || path.endsWith(b.path) || b.path.endsWith(path));
      if (u) value.value = u.value;
    },
    { onState: (s) => (state.value = s) },
  );
  onBeforeUnmount(() => {
    live = false;
    sub.close();
  });

  return { value, state, env: readEnv() };
}
