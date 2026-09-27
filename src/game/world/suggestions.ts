import type { CrateArea, CrateLook } from './crateLayout';

/** Something in the Git World the player clicked. */
export type WorldTarget =
  | {
      readonly kind: 'crate';
      readonly path: string;
      readonly area: CrateArea;
      readonly look: CrateLook;
    }
  | { readonly kind: 'vault' }
  | { readonly kind: 'commit'; readonly shortId: string };

export interface Suggestion {
  /** The command that does what the click meant. */
  readonly command: string;
  /** One line on what it will do, in plain words. */
  readonly note: string;
  /** Where to put the cursor when editing, counted from the end (e.g. inside quotes). */
  readonly cursorFromEnd?: number;
}

/** Paths with spaces need quotes, exactly as when typing them. */
function quoted(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path;
}

/**
 * DESIGN.md pillar 2, two-way mapping: every world action shows the real command. The
 * click never changes state by itself; it offers the command, and the player runs it.
 */
export function suggestFor(target: WorldTarget): Suggestion {
  if (target.kind === 'vault') {
    return {
      command: 'git commit -m ""',
      note: 'Seal everything on the Loading Dock into a commit.',
      cursorFromEnd: 1,
    };
  }
  if (target.kind === 'commit') {
    return {
      command: `git show ${target.shortId}`,
      note: 'See the message and the changes in this commit.',
    };
  }
  const path = quoted(target.path);
  if (target.area === 'dock') {
    return {
      command: `git restore --staged ${path}`,
      note: 'Take it off the Loading Dock. Your edit stays on the Workbench.',
    };
  }
  if (target.area === 'blocklist') {
    return {
      command: `git add -f ${path}`,
      note: '.gitignore blocks this file. Only force it in if it is not a secret or build output.',
    };
  }
  switch (target.look) {
    case 'untracked':
      return {
        command: `git add ${path}`,
        note: 'Start tracking this new file: move it to the Loading Dock.',
      };
    case 'modified':
      return { command: `git add ${path}`, note: 'Stage this edit: move it to the Loading Dock.' };
    case 'deleted':
      return {
        command: `git add ${path}`,
        note: 'Stage the deletion so the next commit removes it.',
      };
    default:
      return {
        command: `git log --oneline -- ${path}`,
        note: 'Nothing changed here. See the commits that touched it.',
      };
  }
}
