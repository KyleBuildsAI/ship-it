import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The mentor modes that have a system prompt today (DESIGN.md section 9, M1). */
export type PromptMode = 'hint' | 'grade_question';

/** One finished system prompt per mode: Sage's shared persona followed by the mode's rules. */
export type MentorPrompts = Record<PromptMode, string>;

const PERSONA_FILE = 'sage.md';
const MODE_FILES: Record<PromptMode, string> = {
  hint: 'hint.md',
  grade_question: 'grade_question.md',
};

async function readPromptFile(directory: string, fileName: string): Promise<string> {
  const path = join(directory, fileName);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`Could not read the Sage prompt file ${path}`, { cause: error });
  }
  if (text.trim() === '') throw new Error(`The Sage prompt file ${path} is empty`);
  return text.trim();
}

/**
 * Reads the prompts once at startup. They live in Markdown files, not code, so Kyle can
 * read and tune Sage's voice without touching TypeScript. A missing or empty file stops
 * the server with a clear message, because a Sage without instructions gives bad advice.
 */
export async function loadPrompts(directory: string): Promise<MentorPrompts> {
  const persona = await readPromptFile(directory, PERSONA_FILE);
  const [hint, gradeQuestion] = await Promise.all([
    readPromptFile(directory, MODE_FILES.hint),
    readPromptFile(directory, MODE_FILES.grade_question),
  ]);
  return {
    hint: `${persona}\n\n${hint}`,
    grade_question: `${persona}\n\n${gradeQuestion}`,
  };
}
