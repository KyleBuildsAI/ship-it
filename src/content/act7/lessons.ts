import type { LessonInput } from '../../game/missions/lessonSchema';
import { briefTheAgent } from './briefTheAgent';
import { guardrailsForAgents } from './guardrailsForAgents';
import { readWhatItWrote } from './readWhatItWrote';
import { testsAndEvals } from './testsAndEvals';
import { theAgentWentRogue } from './theAgentWentRogue';

/*
 * Act 7: AI-Native Engineering (DESIGN.md section 11), taught as lessons. Kyle works at
 * Quillwork beside Otto, the team's AI coding agent: he briefs Otto, reads what Otto
 * wrote, guards it with tests and evals, and limits what Otto can reach. Each lesson
 * lives in its own file, so one lesson reads top to bottom without scrolling past others.
 */

/** Act 7's lessons in play order, final last. */
export const act7Lessons: readonly LessonInput[] = [
  briefTheAgent,
  readWhatItWrote,
  testsAndEvals,
  guardrailsForAgents,
  theAgentWentRogue,
];
