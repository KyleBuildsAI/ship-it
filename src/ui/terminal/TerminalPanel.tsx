import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import { hud } from '../../game/hud';
import { sandbox } from '../../game/sandbox';
import { useStore } from '../useStore';
import { completeLine } from './complete';
import { LineEditor } from './lineEditor';
import { colorize } from './tones';

/** Colors matching theme.css, with git's palette tuned for contrast on the dark glass panel. */
const THEME = {
  background: '#0a0f1c',
  foreground: '#e8ecf5',
  cursor: '#6fd3ff',
  cursorAccent: '#0a0f1c',
  selectionBackground: '#2a3a5c',
  black: '#1b2233',
  red: '#ff7b7b',
  green: '#7ee2a8',
  yellow: '#ffcf6b',
  blue: '#7aa7ff',
  magenta: '#d69cff',
  cyan: '#6fd3ff',
  white: '#e8ecf5',
  brightBlack: '#5c6a86',
};

const WELCOME =
  'SHIP IT sandbox. Type \x1b[36mhelp\x1b[0m for commands, or start with \x1b[36mgit init\x1b[0m.';

/**
 * The in-game terminal: xterm.js draws the text, LineEditor handles typing, and every
 * submitted line runs in the sandbox shell. Output is colored by meaning, like real git.
 * It stays mounted while hidden, so the scrollback survives closing and reopening.
 */
export function TerminalPanel({ open }: { open: boolean }) {
  const terminalRef = useRef<Terminal | null>(null);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const terminal = new Terminal({
      fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, ui-monospace, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 2000,
      theme: THEME,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element);
    fit.fit();
    terminalRef.current = terminal;

    const shell = () => sandbox.get().shell;
    const editor = new LineEditor({
      prompt: () => shell().prompt(),
      history: () => shell().history,
      complete: (before) => completeLine(shell(), before),
    });

    terminal.writeln(WELCOME);
    terminal.write(editor.render());

    const typing = terminal.onData((data) => {
      const result = editor.handle(data);
      terminal.write(result.output);
      if (result.clear) terminal.clear();
      for (const line of result.submitted) {
        const outcome = shell().run(line);
        if (outcome.clear) terminal.clear();
        for (const output of outcome.lines)
          terminal.write(`${colorize(output.text, output.tone)}\r\n`);
        if (outcome.openFile) sandbox.update({ openFile: outcome.openFile });
      }
      if (result.submitted.length > 0 || result.clear) terminal.write(editor.render());
    });

    const resize = new ResizeObserver(() => {
      fit.fit();
    });
    resize.observe(element);

    return () => {
      resize.disconnect();
      typing.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

  // Focus only when the player opened the terminal on purpose (see HudState).
  const { terminalFocusRequests } = useStore(hud);
  useEffect(() => {
    if (terminalFocusRequests > 0) terminalRef.current?.focus();
  }, [terminalFocusRequests]);

  return (
    <section
      className={`glass terminal-panel${open ? '' : ' terminal-panel--hidden'}`}
      aria-label="Terminal"
      // inert hides the closed panel from keyboard and screen readers, and drops its focus.
      inert={!open}
      data-typing-surface
    >
      <div ref={host} className="terminal-panel__screen" />
    </section>
  );
}
