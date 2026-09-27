/** Hands the player a file, the way a browser download does. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** A dated file name for a save backup, like ship-it-save-2026-09-27.json. */
export function saveFileName(now: Date): string {
  return `ship-it-save-${now.toISOString().slice(0, 10)}.json`;
}
