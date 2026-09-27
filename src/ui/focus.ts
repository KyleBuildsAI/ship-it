/**
 * True when a key press belongs to a text surface (the terminal, the editor, a form
 * field), so the 3D world must ignore it. DESIGN.md section 14: typing in the terminal
 * or editor never moves the avatar.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-typing-surface]')) return true;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
