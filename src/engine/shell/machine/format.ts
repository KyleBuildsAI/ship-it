import { line, type OutputLine } from '../../git/cli/output';

/**
 * When every item on the laptop was last written, as PowerShell's en-US tables show it.
 * The laptop keeps no clock, so every listing shows the morning Act 1 begins.
 */
export const LAST_WRITE_TIME = '9/27/2026 10:15 AM';

export interface ItemRow {
  readonly name: string;
  readonly kind: 'file' | 'dir';
  readonly hidden: boolean;
  /** Bytes on disk. */
  readonly length: number;
}

export interface ItemSection {
  /** As PowerShell prints it: C:\Users\kyle. */
  readonly folder: string;
  readonly rows: readonly ItemRow[];
}

// PowerShell's file table: Mode left-aligned, LastWriteTime and Length right-aligned.
const row = (mode: string, time: string, length: string, name: string) =>
  `${mode.padEnd(5)}${time.padStart(29)} ${length.padStart(14)} ${name}`;

/**
 * Get-ChildItem's table, byte for byte as PowerShell 7.6 prints it (see the captures):
 * each folder gets a "Directory:" heading and a table, and the whole ends with a blank
 * line. Sections with no rows are left out, and nothing at all prints for none.
 */
export function itemTable(sections: readonly ItemSection[]): OutputLine[] {
  const lines: OutputLine[] = [];
  for (const section of sections) {
    if (section.rows.length === 0) continue;
    lines.push(
      line(''),
      line(`    Directory: ${section.folder}`, 'meta'),
      line(''),
      line(row('Mode', 'LastWriteTime', 'Length', 'Name'), 'meta'),
      line(row('----', '-------------', '------', '----'), 'meta'),
    );
    for (const item of section.rows) {
      const mode = `${item.kind === 'dir' ? 'd' : '-'}${item.kind === 'dir' ? '-' : 'a'}-${item.hidden ? 'h' : '-'}-`;
      const length = item.kind === 'dir' ? '' : String(item.length);
      lines.push(line(row(mode, LAST_WRITE_TIME, length, item.name)));
    }
  }
  if (lines.length > 0) lines.push(line(''));
  return lines;
}

/** Name/Value tables, like Get-ChildItem Env:. The Name column is 30 wide, as PowerShell's. */
export function nameValueTable(entries: readonly { name: string; value: string }[]): OutputLine[] {
  if (entries.length === 0) return [];
  const pair = (name: string, value: string) => `${name.padEnd(30)} ${value}`;
  return [
    line(''),
    line(pair('Name', 'Value'), 'meta'),
    line(pair('----', '-----'), 'meta'),
    ...entries.map((entry) => line(pair(entry.name, entry.value))),
    line(''),
  ];
}

/**
 * A file's size as Windows reports it: UTF-8 bytes, with each line ending as \r\n, the
 * way Windows tools write text. So "ship it\n" is 9 bytes, as in the captures.
 */
export function windowsLength(content: string): number {
  let bytes = 0;
  for (const char of content.replace(/\r\n/g, '\n')) {
    const code = char.codePointAt(0) ?? 0;
    if (char === '\n') bytes += 2;
    else if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}
