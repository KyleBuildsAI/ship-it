import { lazy, Suspense, useEffect } from 'react';
import { hud, toggleTerminal } from '../game/hud';
import { sandbox } from '../game/sandbox';
import { CommandChip } from './CommandChip';
import { ElsewhereNotice } from './ElsewhereNotice';
import { HudMenu } from './menus/HudMenu';
import { PlayPanel } from './play/PlayPanel';
import { StatusBadge } from './StatusBadge';
import { TerminalPanel } from './terminal/TerminalPanel';
import { TitleCard } from './TitleCard';
import { TutorialCard } from './TutorialCard';
import { useSettingsEffects } from './useSettingsEffects';
import { useStore } from './useStore';

// CodeMirror is large and only needed once the player runs `code <file>`, so it loads on demand.
const EditorPanel = lazy(() =>
  import('./editor/EditorPanel').then((module) => ({ default: module.EditorPanel })),
);

export function App() {
  const { terminalOpen } = useStore(hud);
  const { openFile } = useStore(sandbox);
  useSettingsEffects();

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
      <TutorialCard />
      <button
        type="button"
        className="glass hud-button terminal-toggle"
        aria-pressed={terminalOpen}
        onClick={toggleTerminal}
      >
        Terminal <kbd>Ctrl</kbd>+<kbd>`</kbd>
      </button>
      <PlayPanel />
      <HudMenu />
      <CommandChip />
      <TerminalPanel open={terminalOpen} />
      {openFile !== null ? (
        <div className={terminalOpen ? 'editor-dock editor-dock--above-terminal' : 'editor-dock'}>
          {/* A new key per file gives each file a fresh editor with its own unsaved state. */}
          <Suspense fallback={null}>
            <EditorPanel key={openFile} path={openFile} />
          </Suspense>
        </div>
      ) : null}
      <ElsewhereNotice />
    </>
  );
}
