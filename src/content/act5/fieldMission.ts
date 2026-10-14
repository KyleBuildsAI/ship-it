import type { FieldMissionInput } from '../../game/missions/schema';

/**
 * The Act 5 Field Mission (DESIGN.md section 8): put SandCastles behind its first quality
 * gate, a GitHub Actions workflow that runs its checks on every push, and get one green run.
 *
 * Kyle is expected to have his own AI agent write the workflow. What the mission teaches
 * is what to ask for and how to check the result, the same judgment as lesson 5.3, so
 * the checklist is a brief and a review, not YAML to type.
 *
 * The checks read pasted git output in the browser, so no GitHub token is needed:
 * - `git ls-files .github/workflows` lists the workflow only once git tracks it, and an
 *   empty paste fails, so a passing paste names a committed workflow (with no secret file
 *   beside it).
 * - `git log --oneline -1 origin/main -- .github/workflows` prints the newest commit on
 *   GitHub's copy of main that touched the workflow folder. Output at all proves it was
 *   pushed, and the Conventional check holds it to a message like "ci: ...".
 * Whether the run went green lives only on GitHub, and no paste the game reads shows it,
 * so the last checklist item says exactly where to look and what green means.
 */
export const greenOnEveryPush: FieldMissionInput = {
  id: 'green-on-every-push',
  title: 'Green on Every Push',
  repoName: 'SandCastles',
  briefing: [
    'Real repo, real gate. Today nothing stops a broken change from landing on SandCastles. A CI workflow runs its tests on every push, so a red X shows up before anyone ships the break.',
    "You don't write the YAML. You brief your own AI agent, check what it made, and get one green run on GitHub.",
  ],
  checklist: [
    {
      id: 'find-the-check',
      text: 'Ask your agent: "Which command runs this repo\'s tests? If there are none, which runs the lint? Run it and show me the output." It has to pass on your machine first. CI only repeats what already works.',
    },
    {
      id: 'brief-the-workflow',
      text: 'Brief it: "Add .github/workflows/ci.yml. Run on every push and pull request, install dependencies, then run that command. No secrets, no deploy. Show me the file before you commit."',
    },
    {
      id: 'review-the-file',
      text: 'Read the file as in lesson 5.3. Under on: you want push. The last step runs your test command. If you see || true or continue-on-error, it can never go red: send it back.',
    },
    {
      id: 'commit-and-push',
      text: 'Have it commit with a message that starts with ci:, like "ci: run tests on every push", then push to main.',
    },
    {
      id: 'watch-it-go-green',
      text: 'On GitHub, open SandCastles, then the Actions tab, and wait for a green check on that run. Red? Copy the first error from the log and brief your agent to fix the cause, not to skip the test.',
    },
  ],
  verifications: [
    {
      id: 'workflow-tracked',
      instruction:
        'In PowerShell, in your SandCastles folder, run this and paste what it prints. Your workflow file must be on the list, which proves git tracks it.',
      command: 'git ls-files .github/workflows',
      parser: 'ls-files',
      check: { kind: 'noTrackedSecrets' },
    },
    {
      id: 'workflow-pushed',
      instruction:
        "Run git fetch, then this, and paste the line. It's the newest commit on GitHub's main that changed your workflow, so it proves you pushed. It should start with ci:.",
      command: 'git log --oneline -1 origin/main -- .github/workflows',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
    },
  ],
};
