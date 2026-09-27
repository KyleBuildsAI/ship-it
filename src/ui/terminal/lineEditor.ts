/** What the terminal should do after a keystroke: text to draw, lines to run, screen clears. */
export interface EditResult {
  readonly output: string;
  readonly submitted: readonly string[];
  readonly clear: boolean;
}

export interface LineEditorOptions {
  prompt: () => string;
  history: () => readonly string[];
  /** Given the text before the cursor, the text that should replace its last word, or null. */
  complete?: (beforeCursor: string) => string | null;
}

const KEYS = {
  enter: '\r',
  backspace: '\x7f',
  ctrlC: '\x03',
  ctrlL: '\x0c',
  tab: '\t',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  home: ['\x1b[H', '\x1bOH', '\x1b[1~', '\x01'],
  end: ['\x1b[F', '\x1bOF', '\x1b[4~', '\x05'],
  delete: '\x1b[3~',
} as const;

/**
 * The typing half of a terminal: xterm.js only draws characters and reports keys, so
 * editing the current line (cursor, backspace, history, Tab) happens here. It is pure
 * (keys in, text out), which lets it be tested without a browser.
 */
export class LineEditor {
  private readonly options: LineEditorOptions;
  private buffer = '';
  private cursor = 0;
  /** Position while browsing history with the arrow keys; null when editing a new line. */
  private historyIndex: number | null = null;
  private draft = '';

  constructor(options: LineEditorOptions) {
    this.options = options;
  }

  get line(): string {
    return this.buffer;
  }

  /** Replaces the whole line, e.g. with a command suggested by a click in the world. */
  replaceLine(text: string, cursorFromEnd = 0): string {
    this.buffer = text;
    this.cursor = Math.max(0, text.length - cursorFromEnd);
    this.historyIndex = null;
    return this.render();
  }

  /** The prompt plus the current line, used when the terminal first opens or after output. */
  render(): string {
    const back = this.buffer.length - this.cursor;
    return `\r\x1b[K${this.options.prompt()}${this.buffer}${back > 0 ? `\x1b[${String(back)}D` : ''}`;
  }

  handle(data: string): EditResult {
    const submitted: string[] = [];
    let clear = false;
    let output = '';
    let index = 0;

    while (index < data.length) {
      const rest = data.slice(index);
      const sequence = this.matchSequence(rest);
      if (sequence !== null) {
        index += sequence.length;
        const effect = this.applyKey(sequence);
        if (effect === 'submit') {
          output += `${this.render()}\r\n`;
          submitted.push(this.buffer);
          this.reset();
        } else if (effect === 'cancel') {
          output += `${this.render()}^C\r\n`;
          this.reset();
        } else if (effect === 'clear') {
          clear = true;
        }
        continue;
      }
      const char = rest.charAt(0);
      index += 1;
      // Pasted Windows line endings arrive as \r\n; the \r already submitted the line.
      if (char === '\n') continue;
      if (char >= ' ' && char !== '\x7f') this.insert(char);
    }
    return {
      output: submitted.length > 0 || output !== '' ? output : this.render(),
      submitted,
      clear,
    };
  }

  private matchSequence(rest: string): string | null {
    const all = [
      KEYS.enter,
      KEYS.backspace,
      KEYS.ctrlC,
      KEYS.ctrlL,
      KEYS.tab,
      KEYS.up,
      KEYS.down,
      KEYS.right,
      KEYS.left,
      KEYS.delete,
      ...KEYS.home,
      ...KEYS.end,
    ];
    return all.find((sequence) => rest.startsWith(sequence)) ?? null;
  }

  private applyKey(key: string): 'submit' | 'cancel' | 'clear' | null {
    switch (key) {
      case KEYS.enter:
        return 'submit';
      case KEYS.ctrlC:
        return 'cancel';
      case KEYS.ctrlL:
        return 'clear';
      case KEYS.backspace:
        if (this.cursor > 0) {
          this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
          this.cursor--;
        }
        return null;
      case KEYS.delete:
        this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
        return null;
      case KEYS.left:
        this.cursor = Math.max(0, this.cursor - 1);
        return null;
      case KEYS.right:
        this.cursor = Math.min(this.buffer.length, this.cursor + 1);
        return null;
      case KEYS.up:
        this.browseHistory(-1);
        return null;
      case KEYS.down:
        this.browseHistory(1);
        return null;
      case KEYS.tab:
        this.completeWord();
        return null;
      default:
        this.cursor = (KEYS.home as readonly string[]).includes(key) ? 0 : this.buffer.length;
        return null;
    }
  }

  private insert(text: string): void {
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
  }

  private browseHistory(direction: -1 | 1): void {
    const history = this.options.history();
    if (history.length === 0) return;
    if (this.historyIndex === null) {
      if (direction === 1) return;
      this.draft = this.buffer;
      this.historyIndex = history.length;
    }
    const next = this.historyIndex + direction;
    if (next < 0) return;
    if (next >= history.length) {
      this.historyIndex = null;
      this.setLine(this.draft);
      return;
    }
    this.historyIndex = next;
    this.setLine(history[next] ?? '');
  }

  private completeWord(): void {
    const before = this.buffer.slice(0, this.cursor);
    const replacement = this.options.complete?.(before);
    if (replacement === null || replacement === undefined) return;
    const wordStart = before.lastIndexOf(' ') + 1;
    this.buffer = before.slice(0, wordStart) + replacement + this.buffer.slice(this.cursor);
    this.cursor = wordStart + replacement.length;
  }

  private setLine(text: string): void {
    this.buffer = text;
    this.cursor = text.length;
  }

  private reset(): void {
    this.buffer = '';
    this.cursor = 0;
    this.historyIndex = null;
    this.draft = '';
  }
}
