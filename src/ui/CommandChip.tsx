import { useEffect, useRef } from 'react';
import { hud, sendToTerminal, suggest } from '../game/hud';
import { useStore } from './useStore';

/**
 * Shows the git command that matches what the player clicked in the world, with a
 * one-line explanation. Running it goes through the terminal, so every world action is
 * also a command the player sees (DESIGN.md pillar 2).
 */
export function CommandChip() {
  const { suggestion } = useStore(hud);
  const runButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!suggestion) return;
    runButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') suggest(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [suggestion]);

  if (!suggestion) return null;
  const { command, note, cursorFromEnd = 0 } = suggestion;
  // A command with an empty message (git commit -m "") needs the player's words first.
  const needsInput = cursorFromEnd > 0;

  return (
    <aside className="glass command-chip" aria-label="Suggested command" aria-live="polite">
      <code className="command-chip__command">{command}</code>
      <p className="command-chip__note">{note}</p>
      <div className="command-chip__actions">
        <button
          ref={runButton}
          type="button"
          className="command-chip__primary"
          onClick={() => {
            sendToTerminal(command, !needsInput, cursorFromEnd);
          }}
        >
          {needsInput ? 'Type it' : 'Run'}
        </button>
        {needsInput ? null : (
          <button
            type="button"
            onClick={() => {
              sendToTerminal(command, false, cursorFromEnd);
            }}
          >
            Edit first
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss suggestion"
          onClick={() => {
            suggest(null);
          }}
        >
          ×
        </button>
      </div>
    </aside>
  );
}
