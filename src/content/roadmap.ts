import {
  RoadmapSchema,
  type RoadmapAct,
  type RoadmapActInput,
} from '../game/missions/roadmapSchema';

/**
 * Every Act of the course, as DESIGN.md section 11 plans it, and where each stands today.
 * Preview mode ("Unlock everything" in Settings) shows it. Every word must stay true: when
 * a part ships, its Act's stage and status change in the same PR. Tests check that the
 * playable Acts are exactly the catalog's, with the same titles.
 */
const ROADMAP_INPUT: readonly RoadmapActInput[] = [
  {
    act: 1,
    title: 'The Machine',
    topics:
      'What every engineer who directs AI agents needs to know about the machine they run on, learned with Otto on a laptop.',
    stage: 'preview',
    status: 'Preview · No missions yet. The laptop engine runs in a free-play sandbox.',
    missions: [
      { title: 'Where Things Live' },
      { title: 'Deletes Are Forever' },
      { title: 'Secrets Stay Home' },
      { title: 'Every Terminal Is Its Own World' },
      { title: 'Dependencies Are Declared' },
      { title: "Running Isn't Working" },
    ],
    boss: { title: 'Works on My Machine' },
    fieldMission: { title: 'Brief Your Real Agent' },
    tryouts: ['laptop-sandbox'],
  },
  {
    act: 2,
    title: 'Git Core',
    topics: 'Three areas, status, add, commit, log, diff, .gitignore, commit hygiene, undo.',
    stage: 'playable',
    status: 'Playable: the placement test, every mission, the boss and the Field Mission.',
    missions: [
      { title: 'Three Rooms' },
      { title: 'Reading History' },
      { title: 'Good Commits' },
      { title: 'The Ignore List' },
      { title: 'Undo Everything' },
    ],
    boss: { title: 'The Dirty Tree' },
    fieldMission: { title: 'Clean the Dirty Tree' },
  },
  {
    act: 3,
    title: 'Branching',
    topics:
      'Pointers, switch, merge (fast-forward and three-way), conflicts, rebase vs merge, cherry-pick, stash, tags, bisect.',
    stage: 'planned',
    status: 'Planned · Not built yet.',
    boss: { title: 'Conflict Storm' },
  },
  {
    act: 4,
    title: 'GitHub Team Flow',
    topics:
      'Remotes, fetch/pull/push, forks, issues, PRs, review etiquette, protected branches, CODEOWNERS, releases, semantic versioning, changelogs.',
    stage: 'planned',
    status: 'Planned · Not built yet.',
    boss: { title: 'Rejected Push' },
  },
  {
    act: 5,
    title: 'Quality Gates',
    topics:
      'Unit, integration, and end-to-end tests. Linting, types, GitHub Actions, self-hosted runners, deploys, secrets management, dependency updates.',
    stage: 'planned',
    status: 'Planned · Not built yet.',
    boss: { title: 'Red CI' },
  },
  {
    act: 6,
    title: 'How Systems Work',
    topics:
      'HTTP, REST, JSON, auth (API keys, OAuth, sessions), SQL basics, indexes, caching, queues, containers, cloud basics, logs, reading stack traces.',
    stage: 'planned',
    status: 'Planned · Not built yet.',
    boss: { title: 'The 3am Page' },
  },
  {
    act: 7,
    title: 'AI-Native Engineering',
    topics:
      'Writing specs for agents, reviewing AI-written diffs, tests as guardrails, evals, tool use, context management, prompt injection, secrets and permissions, cost and latency trade-offs.',
    stage: 'planned',
    status: 'Planned · Not built yet.',
    boss: { title: 'The Agent Went Rogue' },
  },
  {
    act: 8,
    title: 'The Loop',
    topics:
      'Live Python coding (no AI), debugging round, system design, customer scenario (forward-deployed style), project deep-dive (SandCastles), values round.',
    stage: 'planned',
    status: 'Planned · Not built yet.',
    boss: { title: 'A full mock interview loop' },
  },
];

/** The roadmap, parsed once when the game loads. The tests prove this parse never throws. */
export const ROADMAP: readonly RoadmapAct[] = RoadmapSchema.parse(ROADMAP_INPUT);

/** Act `number`'s roadmap entry, or undefined for a number outside 1 to 8. */
export function roadmapAct(number: number): RoadmapAct | undefined {
  return ROADMAP.find((entry) => entry.act === number);
}
