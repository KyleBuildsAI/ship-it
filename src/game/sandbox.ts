import { folder } from '../engine/git/fixtures';
import { Shell } from '../engine/shell/shell';
import { createStore } from './store';

/** How the sandbox's project folder appears in prompts, like a real Windows path. */
export const DISPLAY_ROOT = 'C:\\Users\\kyle\\quillwork\\app';

/**
 * The starter project in free play: a small app that isn't a git repository yet, so
 * `git init` is the first thing to try. Missions replace it with their own setups.
 */
function practiceProject(): Shell {
  const ws = folder()
    .write('README.md', '# Quillwork App\n\nA tiny app for practising git.\n')
    .write(
      'src/app.ts',
      'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
    )
    .write('src/config.ts', 'export const PORT = 5173;\n')
    .build();
  return new Shell(ws, DISPLAY_ROOT);
}

export interface SandboxState {
  /** The shell the terminal talks to; its workspace is the Workbench, Dock, and Vault. */
  shell: Shell;
  /** A path the player asked to edit with `code <file>`, or null when the editor is closed. */
  openFile: string | null;
}

export const sandbox = createStore<SandboxState>({ shell: practiceProject(), openFile: null });
