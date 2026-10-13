import { For } from 'solid-js';
import { toasts } from '../ui';

export default function Toasts() {
  return (
    <div class="toasts mono" aria-live="polite">
      <For each={toasts()}>{(t) => <div class={`toast ${t.tone}`}>{t.text}</div>}</For>
    </div>
  );
}
