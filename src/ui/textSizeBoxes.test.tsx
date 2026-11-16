import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { suggest } from '../game/hud';
import { progress } from '../game/progress';
import { createDefaultSave } from '../game/save/schema';
import { TEST_NOW } from '../game/save/testFixtures';
import type { Store } from '../game/store';
import { worldState } from '../game/worldState';
import { CommandChip } from './CommandChip';
import { ElsewhereNotice } from './ElsewhereNotice';
import { Overlay } from './menus/Overlay';
import { TitleCard } from './TitleCard';

// Rendered to an HTML string, as in ActMenu.test.tsx: the real hook has no server
// snapshot, so here it just reads the store.
vi.mock('./useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

afterEach(() => {
  suggest(null);
  progress.update({ status: 'loading', save: null, problem: null });
  worldState.update({ hasMoved: false });
});

/*
 * theme.css zooms the __content box inside each box placed on the screen for Large and
 * Extra large text, never the placed box itself (theme.test.ts). Each test checks that box
 * wraps everything the player reads: without it, those sizes would change nothing there.
 */
describe('the boxes that larger text sizes grow the words in', () => {
  it('a menu (Settings, Trophies and Standup all open in Overlay), its × button included', () => {
    const html = renderToStaticMarkup(
      <Overlay title="Settings">
        <p>Text size</p>
      </Overlay>,
    );
    expect(html).toMatch(
      /^<section class="glass overlay"[^>]*><div class="overlay__content"><header class="play-panel__header"><h2>Settings<\/h2><button/,
    );
    expect(html).toMatch(/<p>Text size<\/p><\/div><\/section>$/);
  });

  it('the notice shown when another tab has the save', () => {
    progress.update({ status: 'elsewhere', save: createDefaultSave(TEST_NOW), problem: null });
    const html = renderToStaticMarkup(<ElsewhereNotice />);
    expect(html).toMatch(
      /^<dialog class="glass overlay elsewhere"[^>]*><div class="overlay__content"><h2 id="elsewhere-title">/,
    );
    expect(html).toMatch(/<\/div><\/div><\/dialog>$/);
  });

  it('the command chip', () => {
    suggest({ command: 'git status', note: 'Shows what changed since the last commit.' });
    const html = renderToStaticMarkup(<CommandChip />);
    expect(html).toMatch(
      /^<aside class="glass command-chip"[^>]*><div class="command-chip__content"><code class="command-chip__command">git status<\/code>/,
    );
    expect(html).toMatch(/<\/div><\/div><\/aside>$/);
  });

  it('the title card, with the big title and once it steps aside', () => {
    expect(renderToStaticMarkup(<TitleCard />)).toMatch(
      /^<header class="title-card"><div class="title-card__content"><p class="title-card__eyebrow">.*<\/div><\/header>$/,
    );
    worldState.update({ hasMoved: true });
    expect(renderToStaticMarkup(<TitleCard />)).toMatch(
      /^<header class="title-card title-card--compact"><div class="title-card__content"><h1 class="title-card__zone">.*<\/div><\/header>$/,
    );
  });
});
