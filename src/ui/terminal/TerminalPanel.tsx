import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import { onTerminalFeed } from '../../game/agent/terminalFeed';
import { countCommand, hud, type PendingCommand } from '../../game/hud';
import { play } from '../../game/play/playStore';
import { progress } from '../../game/progress';
import { sandbox } from '../../game/sandbox';
import { useStore } from '../useStore';
import { completeLine } from './complete';
import { FeedPrinter, noticeText } from './feedText';
import { LineEditor } from './lineEditor';
import { isReadOnly } from './readOnly';
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

const FONT_SIZES = { normal: 14, large: 16, 'x-large': 18 } as const;

const WELCOME =
  'SHIP IT sandbox. Type \x1b[36mhelp\x1b[0m for commands, or start with \x1b[36mgit init\x1b[0m.';

/**
 * The page can load before it has its real width (a window still opening, a background
 * tab), and text written then stays wrapped at that width, two letters per line. So the
 * greeting waits until the terminal is at least this many columns wide.
 */
const MIN_GREETING_COLUMNS = 20;

/** What the effects below ask of the terminal that the first effect builds. */
interface TerminalControls {
  /** Otto's feed takes the last line: the player can read, but keys don't type. */
  readonly ottoTakesOver: () => void;
  /** The player's line editor takes the last line back, with a fresh prompt. */
  readonly kyleTakesBack: () => void;
  /** Prints a game message above whatever line is open. */
  readonly notice: (text: string) => void;
  /** Types a command from the HUD on the player's line (and maybe runs it), like keys. */
  readonly typeCommand: (command: PendingCommand) => void;
}

/**
 * The in-game terminal: xterm.js draws the text, LineEditor handles typing, and every
 * submitted line runs in the sandbox shell. Output is colored by meaning, like real git.
 * While Otto has the terminal (Act 1's missions and drills) it shows his feed instead,
 * and typing is off. It stays mounted while hidden, so the scrollback survives closing
 * and reopening.
 */
export function TerminalPanel({ open }: { open: boolean }) {
  const terminalRef = useRef<Terminal | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<TerminalControls | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

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
    fitRef.current = fit;

    const shell = () => sandbox.get().shell;
    const editor = new LineEditor({
      prompt: () => shell().prompt(),
      history: () => shell().history,
      complete: (before) => completeLine(shell(), before),
    });

    let greeted = false;
    const greet = (evenIfNarrow: boolean) => {
      if (greeted || (!evenIfNarrow && terminal.cols < MIN_GREETING_COLUMNS)) return;
      greeted = true;
      terminal.writeln(WELCOME);
      terminal.write(editor.render());
    };
    greet(false);

    const printer = new FeedPrinter();
    const type = (data: string) => {
      // Otto has the terminal: keys don't type, but the first one says why.
      if (printer.ottoHasTheLine) {
        terminal.write(printer.refuseKeys(shell().prompt()));
        return;
      }
      // Typing needs a prompt to type after, however narrow the terminal still is.
      greet(true);
      const result = editor.handle(data);
      terminal.write(result.output);
      if (result.clear) terminal.clear();
      for (const line of result.submitted) {
        if (line.trim() !== '') countCommand();
        const outcome = shell().run(line);
        if (outcome.clear) terminal.clear();
        for (const output of outcome.lines)
          terminal.write(`${colorize(output.text, output.tone)}\r\n`);
        if (outcome.openFile) sandbox.update({ openFile: outcome.openFile });
      }
      if (result.submitted.length > 0 || result.clear) terminal.write(editor.render());
    };
    const typing = terminal.onData(type);

    const ottoTakesOver = () => {
      if (printer.ottoHasTheLine) return;
      // The greeting is for free play. Printed later, it would land in the middle of the feed.
      greeted = true;
      terminal.write(printer.takeOver(shell().prompt()));
    };
    const kyleTakesBack = () => {
      if (printer.ottoHasTheLine) terminal.write(printer.handBack() + editor.render());
    };
    const stopFeed = onTerminalFeed((reveals) => {
      // What Otto (or a look) ran always prints. If the player had the line, as in free
      // play, it goes straight back to them afterwards.
      const kyleHadIt = !printer.ottoHasTheLine;
      ottoTakesOver();
      terminal.write(printer.print(reveals));
      if (kyleHadIt) kyleTakesBack();
    });
    controlsRef.current = {
      ottoTakesOver,
      kyleTakesBack,
      notice: (text) => {
        const prompt = shell().prompt();
        terminal.write(
          printer.ottoHasTheLine
            ? printer.notice(text, prompt)
            : noticeText(text) + editor.render(),
        );
      },
      typeCommand: (command) => {
        if (printer.ottoHasTheLine) {
          terminal.write(printer.refuseKeys(shell().prompt()));
          return;
        }
        terminal.write(editor.replaceLine(command.text, command.cursorFromEnd));
        if (command.run) type('\r');
      },
    };

    const resize = new ResizeObserver(() => {
      fit.fit();
      greet(false);
    });
    resize.observe(element);

    return () => {
      resize.disconnect();
      stopFeed();
      typing.dispose();
      terminal.dispose();
      terminalRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  const { pendingCommand, terminalFocusRequests, notice } = useStore(hud);
  const textSize = useStore(progress).save?.settings.textSize ?? 'normal';
  const readOnly = isReadOnly(useStore(play).activity);

  // Declared before the notice below: a mission's first message then prints above the
  // prompt Otto takes over, not above the player's.
  useEffect(() => {
    if (readOnly) controlsRef.current?.ottoTakesOver();
    else controlsRef.current?.kyleTakesBack();
  }, [readOnly]);

  // Text size reaches the terminal through xterm's own font size; CSS zoom would break its
  // mouse and selection maths.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = FONT_SIZES[textSize];
    fitRef.current?.fit();
  }, [textSize]);

  // Game messages print above a fresh prompt, in the accent color, so they read as the game
  // talking rather than command output.
  useEffect(() => {
    if (notice) controlsRef.current?.notice(notice.text);
  }, [notice]);

  // A click in the world can ask the terminal to type (and maybe run) a command.
  useEffect(() => {
    if (pendingCommand) controlsRef.current?.typeCommand(pendingCommand);
  }, [pendingCommand]);

  // Focus only when the player opened the terminal on purpose (see HudState).
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
