import { useEffect } from 'react';
import { hud, toggleTerminal } from '../game/hud';
import { StatusBadge } from './StatusBadge';
import { TerminalPanel } from './terminal/TerminalPanel';
import { TitleCard } from './TitleCard';
import { useStore } from './useStore';

export function App() {
  const { terminalOpen } = useStore(hud);

  useEffect(() => {
    // Ctrl+` toggles the terminal, the same shortcut as VS Code.
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.code === 'Backquote') {
        event.preventDefault();
        toggleTerminal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <>
      <StatusBadge />
      <TitleCard />
      <button
        type="button"
        className="glass hud-button terminal-toggle"
        aria-pressed={terminalOpen}
        onClick={toggleTerminal}
      >
        Terminal <kbd>Ctrl</kbd>+<kbd>`</kbd>
      </button>
      <TerminalPanel open={terminalOpen} />
    </>
  );
}
