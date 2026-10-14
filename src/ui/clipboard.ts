/** The one clipboard call the game makes, so a test can hand in a fake. */
export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

/** The page's clipboard, or null where the browser has none (a page that isn't https). */
export function pageClipboard(): ClipboardWriter | null {
  if (typeof navigator === 'undefined') return null;
  // The DOM typings say clipboard always exists, but it's undefined outside secure pages.
  return (navigator as { clipboard?: ClipboardWriter }).clipboard ?? null;
}

/**
 * Copies text and says whether it worked. The clipboard can be missing, or the browser can
 * refuse, and the caller shows the player how to copy by hand instead, so a failure is a
 * `false`, never a thrown error.
 */
export async function copyText(
  text: string,
  clipboard: ClipboardWriter | null = pageClipboard(),
): Promise<boolean> {
  if (clipboard === null) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    // Refused (no permission, or the page lost focus). The caller says so on screen.
    return false;
  }
}
