import { useEffect, useRef, type ReactNode } from 'react';
import { openMenu } from '../../game/hud';

/** A centered glass panel over the world. Escape or × closes it. */
export function Overlay({ title, children }: { title: string; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') openMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <section
      ref={panel}
      className="glass overlay"
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      data-typing-surface
    >
      <header className="play-panel__header">
        <h2>{title}</h2>
        <button
          type="button"
          className="play-panel__close"
          aria-label={`Close ${title}`}
          onClick={() => {
            openMenu(null);
          }}
        >
          ×
        </button>
      </header>
      {children}
    </section>
  );
}
