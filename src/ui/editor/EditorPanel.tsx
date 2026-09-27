import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef, useState } from 'react';
import { sandbox } from '../../game/sandbox';

/** Syntax highlighting chosen by file extension; plain text for anything else. */
function languageFor(path: string): Extension[] {
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) {
    return [javascript({ typescript: /\.tsx?$/.test(path) })];
  }
  if (path.endsWith('.md')) return [markdown()];
  return [];
}

/** Keeps the editor on the glass panel instead of One Dark's solid background. */
const glassTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'transparent', fontSize: '14px' },
    '.cm-scroller': {
      fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, ui-monospace, monospace",
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      borderRight: '1px solid rgba(160, 200, 255, 0.14)',
    },
  },
  { dark: true },
);

function readFile(path: string): string {
  const { fs } = sandbox.get().shell.ws;
  return fs.isFile(path) ? fs.readFile(path) : '';
}

/**
 * A code editor for one sandbox file, opened with `code <file>`. Saving (Ctrl+S) writes
 * the file into the Workbench, so `git status` and `git diff` see the change right away.
 */
export function EditorPanel({ path }: { path: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const save = (view: EditorView) => {
      sandbox.get().shell.ws.writeFile(path, view.state.doc.toString());
      setDirty(false);
      setSavedOnce(true);
      return true;
    };

    const view = new EditorView({
      parent: element,
      state: EditorState.create({
        doc: readFile(path),
        extensions: [
          keymap.of([{ key: 'Mod-s', run: save, preventDefault: true }]),
          basicSetup,
          oneDark,
          // Earlier extensions win in CodeMirror, so lift the glass overrides above One Dark.
          Prec.highest(glassTheme),
          ...languageFor(path),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) setDirty(true);
          }),
        ],
      }),
    });
    view.focus();
    return () => {
      view.destroy();
    };
  }, [path]);

  return (
    <section className="glass editor-panel" aria-label={`Editor: ${path}`} data-typing-surface>
      <header className="editor-panel__header">
        <span className="editor-panel__path">
          {path}
          {dirty ? <span aria-label="unsaved changes"> ●</span> : null}
        </span>
        <span className="editor-panel__hint">
          {savedOnce && !dirty ? 'Saved' : 'Ctrl+S to save'}
        </span>
        <button
          type="button"
          className="editor-panel__close"
          aria-label="Close editor"
          onClick={() => {
            sandbox.update({ openFile: null });
          }}
        >
          ×
        </button>
      </header>
      <div ref={host} className="editor-panel__body" />
    </section>
  );
}
