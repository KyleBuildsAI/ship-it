import type { Typist } from '../../game/agent/feed';
import type { Reveal } from '../../game/agent/pace';
import { colorize } from './tones';

/** Back to the start of the line, then clear it, so the line can be drawn again. */
const CLEAR_LINE = '\r\x1b[K';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
/** Otto's color everywhere (spec D14): the theme's magenta, #d69cff. */
const MAGENTA = '\x1b[35m';
/** The theme's dim gray (brightBlack), for text the terminal adds around the feed. */
const DIM = '\x1b[90m';

/** At the start of each line Otto types, so his lines stand apart from Kyle's looks. */
export const OTTO_MARKER = `${MAGENTA}otto ›${RESET} `;

/** Shown once when the player types while Otto has the terminal, so it doesn't seem broken. */
export const READ_ONLY_HINT = 'Read-only while Otto works. Use the panel to direct and answer.';

/** A terminal tab's name, the same in the tab strip and in dividers: PS 1, PS 2. */
export function tabLabel(tab: number): string {
  return `PS ${String(tab)}`;
}

/** A line from the game itself, not from a command, printed in cyan above the open line. */
export function noticeText(text: string): string {
  return `${CLEAR_LINE}${CYAN}${text}${RESET}\r\n`;
}

/** The terminal's last line while it's still open: a prompt, and what's typed after it. */
interface OpenLine {
  readonly prompt: string;
  readonly typed: string;
  /** Who is typing it, once typing has begun. Otto's line wears his marker. */
  readonly by: Typist | null;
}

/** A prompt with nothing typed after it yet. */
function waiting(prompt: string): OpenLine {
  return { prompt, typed: '', by: null };
}

/**
 * The terminal's side of Otto's feed: it turns what the pace reveals into text for xterm.
 * The feed decides what appears and the pace decides when; this only draws. It keeps the
 * last line while that line is open, so it can end it before a fresh one, or draw it
 * again with Otto's marker or under a game message.
 *
 * The terminal's last line belongs to one of two writers. Normally it's the player's line
 * editor. While Otto has the terminal it's this printer, and keys don't type. Like
 * LineEditor, it's pure: reveals in, text out, which lets it be tested without a browser.
 */
export class FeedPrinter {
  private line: OpenLine | null = null;
  private otto = false;
  private hinted = false;

  /** Otto's feed draws the last line now, so the line editor must leave it alone. */
  get ottoHasTheLine(): boolean {
    return this.otto;
  }

  /**
   * Otto takes the last line. The player's unrun text is hidden (the line editor keeps
   * it for later) and the active tab's `prompt` waits there for Otto's first line.
   */
  takeOver(prompt: string): string {
    this.otto = true;
    this.hinted = false;
    this.line = waiting(prompt);
    return CLEAR_LINE + prompt;
  }

  /**
   * Gives the last line back to the line editor, which draws its own prompt next. A line
   * Otto typed but never ran stays on screen, so the editor's prompt goes below it.
   */
  handBack(): string {
    const typed = this.line !== null && this.line.typed !== '';
    this.otto = false;
    this.line = null;
    return typed ? '\r\n' : '';
  }

  /** Draws what the pace revealed, in order. */
  print(reveals: readonly Reveal[]): string {
    let text = '';
    for (const reveal of reveals) text += this.draw(reveal);
    return text;
  }

  /**
   * Prints a game message above the open line, then draws that line again. A prompt that
   * waits with nothing typed shows `prompt`, the shell's prompt now: a message usually
   * means a new sandbox, whose terminal stands somewhere else.
   */
  notice(text: string, prompt: string): string {
    if (this.line === null || this.line.typed === '') this.line = waiting(prompt);
    return noticeText(text) + this.redraw();
  }

  /** The player pressed a key while Otto has the terminal: a hint, once per takeover. */
  refuseKeys(prompt: string): string {
    if (this.hinted) return '';
    this.hinted = true;
    return this.notice(READ_ONLY_HINT, prompt);
  }

  /** The open line drawn again from its start: Otto's marker, the prompt, the typing. */
  private redraw(): string {
    if (this.line === null) return '';
    const marker = this.line.by === 'otto' ? OTTO_MARKER : '';
    return `${CLEAR_LINE}${marker}${this.line.prompt}${this.line.typed}`;
  }

  /** Ends the open line, so what comes next starts on a fresh one. */
  private endLine(): string {
    if (this.line === null) return '';
    this.line = null;
    return '\r\n';
  }

  private draw(reveal: Reveal): string {
    if (reveal.kind === 'keys') return this.keys(reveal.by, reveal.text, reveal.from);
    const { beat } = reveal;
    switch (beat.kind) {
      case 'divider':
        return `${this.endLine()}${DIM}── ${tabLabel(beat.tab)} ──${RESET}\r\n`;
      case 'prompt': {
        // Already waiting there, like the prompt drawn when Otto took over: never twice.
        if (this.line?.typed === '' && this.line.prompt === beat.text) return '';
        const end = this.endLine();
        this.line = waiting(beat.text);
        return end + beat.text;
      }
      case 'type':
        // The pace reveals typing as keys; a whole typed line is drawn the same way.
        return this.keys(beat.by, beat.text, 0);
      case 'enter':
        return this.endLine();
      case 'cancel':
        return this.line === null ? '' : `${DIM}  (denied)${RESET}${this.endLine()}`;
      case 'output': {
        const end = this.endLine();
        return end + beat.lines.map((out) => `${colorize(out.text, out.tone)}\r\n`).join('');
      }
      case 'world':
      case 'result':
        // The world animates from the engine's own events, and the run log shows exit
        // codes, so neither prints anything here.
        return '';
    }
  }

  /** The next keys of a typed line, `from` characters in. */
  private keys(by: Typist, text: string, from: number): string {
    const line = this.line ?? waiting('');
    if (from === 0) {
      this.line = { prompt: line.prompt, typed: text, by };
      // Otto's first key draws the line again with his marker in front of the prompt.
      return by === 'otto' ? this.redraw() : text;
    }
    this.line = { ...line, typed: line.typed + text, by: line.by ?? by };
    return text;
  }
}
