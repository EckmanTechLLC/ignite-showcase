import type { ReactNode } from 'react';
import { togglePanel, type PanelId } from './ui';

/** Slide-in panel chrome shared by every overlay. */
export function Panel({ id, title, hint, wide, children }: { id: PanelId; title: string; hint: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`ovl ${wide ? 'wide' : ''}`} aria-label={title}>
      <header className="ovl-h">
        <h2>{title}</h2>
        <kbd>{hint}</kbd>
        <button type="button" className="ovl-x" onClick={() => togglePanel(id, false)} aria-label={`Close ${title}`}>
          ×
        </button>
      </header>
      <div className="ovl-b">{children}</div>
    </section>
  );
}
