import type { JSX } from 'solid-js';
import { closePanel } from '../ui';

export default function Panel(p: { title: string; hotkey: string; head?: JSX.Element; children: JSX.Element }) {
  return (
    <section class="panel mono" aria-label={p.title}>
      <header>
        <h2>
          {p.title} <kbd>{p.hotkey}</kbd>
        </h2>
        <div class="extra">{p.head}</div>
        <button class="x" aria-label="Close panel" onClick={closePanel}>×</button>
      </header>
      <div class="body" tabIndex={0}>{p.children}</div>
    </section>
  );
}
