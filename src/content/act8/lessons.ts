import type { LessonInput } from '../../game/missions/lessonSchema';
import { customersAndYourStory } from './customersAndYourStory';
import { debugFromSymptoms } from './debugFromSymptoms';
import { designTradeOffs } from './designTradeOffs';
import { theMockLoop } from './mockLoop';
import { thinkOutLoud } from './thinkOutLoud';

/*
 * Act 8: The Loop (DESIGN.md section 11), taught as lessons: the rounds of a real
 * interview loop, each built from something that happened at Quillwork. Every answer is a
 * click, because the loop tests judgment: reading code, debugging from symptoms, design
 * trade-offs, customers, your own story, and how you direct AI agents.
 */

/** Act 8's lessons in play order, final last. */
export const act8Lessons: readonly LessonInput[] = [
  thinkOutLoud,
  debugFromSymptoms,
  designTradeOffs,
  customersAndYourStory,
  theMockLoop,
];
