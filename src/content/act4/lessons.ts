import type { LessonInput } from '../../game/missions/lessonSchema';
import { rejectedPush } from './final';
import { issuesAndPullRequests } from './pullRequests';
import { releasesAndVersions } from './releases';
import { remotesAndPushing } from './remotes';
import { reviewingPullRequests } from './reviews';

/*
 * Act 4: GitHub Team Flow (DESIGN.md section 11), taught as lessons set at Quillwork, a
 * small startup: how work travels between laptops and GitHub, and how a team keeps main
 * trustworthy with issues, pull requests, reviews and releases while an AI agent, Otto,
 * writes much of the code. Each lesson has its own file so each reads on its own.
 */

/** Act 4's lessons in play order, final last. */
export const act4Lessons: readonly LessonInput[] = [
  remotesAndPushing,
  issuesAndPullRequests,
  reviewingPullRequests,
  releasesAndVersions,
  rejectedPush,
];
