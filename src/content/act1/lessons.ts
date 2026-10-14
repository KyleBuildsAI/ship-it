import type { LessonInput } from '../../game/missions/lessonSchema';
import { dependenciesAreDeclared } from './dependenciesAreDeclared';
import { runningIsntWorking } from './runningIsntWorking';
import { worksOnMyMachine } from './worksOnMyMachine';

/*
 * The rest of Act 1, taught as lessons (DESIGN.md section 11). Missions 1.1 to 1.4 run
 * Otto on the simulated laptop, but the laptop engine doesn't simulate npm, processes or
 * ports, so 1.5, 1.6 and the final put Kyle in front of their real output instead and
 * ask what he'd do or tell Otto. They play after the directed missions, final last.
 */

/** Act 1's lessons in play order, final last. */
export const act1LessonInputs: readonly LessonInput[] = [
  dependenciesAreDeclared,
  runningIsntWorking,
  worksOnMyMachine,
];
