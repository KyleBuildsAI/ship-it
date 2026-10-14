import type { FieldMissionInput } from '../../game/missions/schema';

/*
 * Act 3's Field Mission (DESIGN.md section 8): land one real branch on Kyle's SandCastles
 * repo. Kyle is a vibe coder who directs an agent, so the checklist tells him what to ask
 * his own AI agent for and what to look for in its answer, not which keys to press.
 *
 * It follows the Act's own lessons: main changes only through a reviewed pull request,
 * never an agent's own merge (3.1 brief-the-branch, 3.2 ff-only, 3.4 brief-the-hotfix).
 * So the agent stops at an open pull request, and Kyle reviews and merges it on GitHub.
 *
 * Every check reads pasted output in the browser, so this needs no GitHub token and no
 * API key. Kyle can run the commands himself or have his agent run them and copy the raw
 * output, because the checker parses real git output, not a summary of it.
 *
 * Why these two checks:
 * - `git log --oneline --graph -5` shows the newest commit on main and, in its drawing,
 *   which commits that merge brought in. The check passes only if the newest commit is a
 *   merge of a typed branch like feat/x whose own commit is Conventional, so an old merge
 *   further down, a squash, or a commit straight on main can't pass.
 * - `git status` must say main, clean, and up to date with origin/main, so the merge Kyle
 *   pasted is the one GitHub has, and nothing was left behind.
 */
const RAW_OUTPUT =
  'Or ask your agent to run it and copy exactly what it prints: the checker reads real git output, so a summary like "all clean" won\'t pass.';

export const landARealBranch = {
  id: 'land-a-real-branch',
  title: 'Land a Real Branch',
  repoName: 'SandCastles',
  briefing: [
    'Real repo, real history. On a team, main stays deployable because changes land through reviewed pull requests, never straight on main.',
    'Have your AI agent make one small change on a branch in SandCastles and open a pull request. You review it and merge it on GitHub with a merge commit. Then prove it here.',
  ],
  checklist: [
    {
      id: 'pick-change',
      text: 'Pick one small, real change for SandCastles, like a README fix. Small changes make short-lived branches, and short-lived branches rarely conflict.',
    },
    {
      id: 'brief-branch',
      text: 'Tell your agent: "Create a branch named feat/ plus a short name, make this change on it, and commit it with a Conventional Commit message. Don\'t touch main."',
    },
    {
      id: 'check-branch',
      text: "Ask it to show git status and git log --oneline -3. Check it's on your new branch, not main, and the commit is there.",
    },
    {
      id: 'brief-pr',
      text: 'Tell it: "Push the branch and open a pull request with gh pr create, then stop. Don\'t merge it." Main only changes through a reviewed pull request, never an agent\'s own merge.',
    },
    {
      id: 'review-merge',
      text: 'On github.com, open the pull request and read its Files changed tab. When it looks right, click the arrow on the merge button, pick "Create a merge commit", then click Merge pull request.',
    },
    {
      id: 'allow-merge-commits',
      text: 'If only "Squash and merge" shows, turn merge commits on: in SandCastles on GitHub, Settings > General > Pull Requests > Allow merge commits.',
    },
    {
      id: 'sync',
      text: `In PowerShell, in your SandCastles folder, run git switch main, then git pull, so your copy matches GitHub before you paste anything. ${RAW_OUTPUT}`,
    },
  ],
  verifications: [
    {
      id: 'merge-landed',
      instruction: `In your SandCastles folder, run git log --oneline --graph -5 and paste everything it prints. The top line should be the merge, with your branch's commit on the line drawn beside it. ${RAW_OUTPUT}`,
      command: 'git log --oneline --graph -5',
      parser: 'log-oneline',
      check: { kind: 'mergeCommit' },
    },
    {
      id: 'main-clean',
      instruction: `Run git status and paste everything it prints. It should say "On branch main", "up to date with 'origin/main'" and "nothing to commit, working tree clean". ${RAW_OUTPUT}`,
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean', branch: 'main', upstream: 'up-to-date' },
    },
  ],
} satisfies FieldMissionInput;
