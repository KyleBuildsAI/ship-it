import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPrompts } from './prompts';

const REAL_PROMPTS_DIR = fileURLToPath(new URL('./prompts', import.meta.url));

describe('loadPrompts', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sage-prompts-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function writePrompts(files: Record<string, string>) {
    for (const [name, text] of Object.entries(files)) {
      await writeFile(join(directory, name), text, 'utf8');
    }
  }

  it('puts the shared persona in front of each mode prompt', async () => {
    await writePrompts({
      'sage.md': 'You are Sage.\n',
      'hint.md': 'Give a hint.\n',
      'grade_question.md': 'Grade the question.\n',
    });

    const prompts = await loadPrompts(directory);

    expect(prompts).toEqual({
      hint: 'You are Sage.\n\nGive a hint.',
      grade_question: 'You are Sage.\n\nGrade the question.',
    });
  });

  it('names the missing file when one is absent', async () => {
    await writePrompts({ 'sage.md': 'You are Sage.', 'hint.md': 'Give a hint.' });

    await expect(loadPrompts(directory)).rejects.toThrow('grade_question.md');
  });

  it('refuses an empty prompt file', async () => {
    await writePrompts({
      'sage.md': '   \n',
      'hint.md': 'Give a hint.',
      'grade_question.md': 'Grade it.',
    });

    await expect(loadPrompts(directory)).rejects.toThrow(/sage\.md is empty/);
  });

  it('loads the real prompt files that ship with the server', async () => {
    const prompts = await loadPrompts(REAL_PROMPTS_DIR);

    expect(prompts.hint).toContain('Quillwork AI');
    expect(prompts.hint).toContain('Level 3');
    expect(prompts.grade_question).toContain('whyItMatters');
  });
});
