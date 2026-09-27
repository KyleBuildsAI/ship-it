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

/**
 * True when a key press goes to the 3D world itself: nothing else on the page has focus,
 * or the canvas does. Space jumps and Enter runs a suggested command only then.
 */
export function isWorldTarget(target: EventTarget | null): boolean {
  return target === document.body || target instanceof HTMLCanvasElement;
}

/**
 * After a mouse click on a HUD button, hands the keyboard back to the world, so Space
 * jumps instead of pressing that button again. Pressing a focused button with Enter or
 * Space reports `detail` 0 and keeps its focus, so keyboard players don't lose their place.
 */
export function releaseMouseFocus(event: {
  detail: number;
  currentTarget: { blur: () => void };
}): void {
  if (event.detail > 0) event.currentTarget.blur();
}
