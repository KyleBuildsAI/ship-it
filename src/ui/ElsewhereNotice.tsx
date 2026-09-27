import { useEffect, useRef } from 'react';
import { leavePlay } from '../game/play/play';
import { progress } from '../game/progress';
import { exportSave } from '../game/save/exportImport';
import { download, saveFileName } from './download';
import { useStore } from './useStore';

/**
 * Covers the game when another tab has taken over the save. It's a native modal dialog:
 * the browser keeps focus inside it and makes everything behind it inert, so this tab
 * can't be played by mistake. "Play here" reloads the page, which asks for the save back.
 */
export function ElsewhereNotice() {
  const { status, problem, save } = useStore(progress);
  const dialog = useRef<HTMLDialogElement>(null);
  const elsewhere = status === 'elsewhere';

  useEffect(() => {
    if (!elsewhere) return;
    // Stop any drill or boss clock: nothing played here can be saved any more.
    leavePlay();
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, [elsewhere]);

  if (!elsewhere) return null;
  return (
    <dialog
      ref={dialog}
      className="glass overlay elsewhere"
      aria-labelledby="elsewhere-title"
      aria-describedby="elsewhere-detail"
      data-typing-surface
      onCancel={(event) => {
        // Escape would only close the notice over a tab that can't save anything.
        event.preventDefault();
      }}
    >
      <h2 id="elsewhere-title">SHIP IT is open in another tab</h2>
      <p id="elsewhere-detail" className="play-panel__instruction">
        {problem === null
          ? "Your progress is saved there. This tab stopped saving, so the two can't overwrite each other."
          : `${problem} Export it now to keep a copy, then play in the other tab.`}
      </p>
      <div className="play-panel__actions">
        <button
          type="button"
          className="play-button play-button--primary"
          onClick={() => {
            window.location.reload();
          }}
        >
          Play here instead
        </button>
        {problem !== null && save !== null ? (
          <button
            type="button"
            className="play-button"
            onClick={() => {
              const now = new Date();
              try {
                download(saveFileName(now), exportSave(save, now));
              } catch (error) {
                console.error('[ship-it] exporting the save from this tab failed', error);
              }
            }}
          >
            Export save
          </button>
        ) : null}
      </div>
    </dialog>
  );
}
