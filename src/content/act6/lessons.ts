import type { LessonInput } from '../../game/missions/lessonSchema';
import { apisAndAuth } from './apisAndAuth';
import { dataSpeedAndScale } from './dataSpeedAndScale';
import { logsAndStackTraces } from './logsAndStackTraces';
import { requestsAndResponses } from './requestsAndResponses';
import { theThreeAmPage } from './theThreeAmPage';

/*
 * Act 6: How Systems Work (DESIGN.md section 11), taught as lessons: reading the requests,
 * data and logs of the systems Kyle will have agents build, so he can tell when their
 * work is right and where to look when it isn't. Each lesson lives in its own file.
 */

export { apisAndAuth, dataSpeedAndScale, logsAndStackTraces, requestsAndResponses, theThreeAmPage };

/** Act 6's lessons in play order, final last. */
export const act6Lessons: readonly LessonInput[] = [
  requestsAndResponses,
  apisAndAuth,
  dataSpeedAndScale,
  logsAndStackTraces,
  theThreeAmPage,
];
