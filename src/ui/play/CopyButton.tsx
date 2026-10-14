import { useState } from 'react';
import { copyText } from '../clipboard';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Copies text for the player, so a long agent brief or a command goes over whole instead
 * of being selected by hand. The clipboard can be missing (an old browser, a page that
 * isn't https) or refused, and then the button says so and how to copy by hand, rather
 * than pretending it worked.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<CopyState>('idle');

  const copy = async () => {
    setState((await copyText(text)) ? 'copied' : 'failed');
  };

  return (
    <span className="copy-button">
      <button
        type="button"
        className="play-button play-button--small"
        aria-label={label}
        onClick={() => {
          void copy();
        }}
      >
        Copy
      </button>
      <span className="copy-button__status" role="status">
        {state === 'copied' ? 'Copied.' : null}
        {state === 'failed' ? 'Couldn’t copy. Select the text and press Ctrl+C.' : null}
      </span>
    </span>
  );
}
