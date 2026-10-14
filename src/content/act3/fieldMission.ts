import type { FieldMissionInput } from '../../game/missions/schema';

/*
 * Act 3's Field Mission (DESIGN.md section 8): land one real branch on Kyle's SandCastles
 * repo. Kyle is a vibe coder who directs an agent, so the checklist tells him what to ask
 * his own AI agent for and what to look for in its answer, not which keys to press. Only
 * the checks are commands, because pasting real output is how the game knows it happened.
 *
 * Every check reads pasted PowerShell output in the browser, so this needs no GitHub
 * token and no API key. Pulling main first means the paste shows what GitHub has, whether
 * Kyle merged on his laptop or through a pull request.
 *
 * Why these three checks:
 * - `git log --oneline --merges -1` prints a line only if main holds a merge commit, so
 *   one commit there proves a branch was merged rather than committed straight to main.
 *   That's also why the checklist asks for a merge commit, not a squash or a rebase.
 * - `git log --oneline --no-merges -1` shows the newest commit someone wrote, which is the
 *   branch's commit, and checks it reads as a Conventional Commit.
 * - `git status` proves nothing was left behind: the branch's work is all committed.
 */
export const landARealBranch = {
  id: 'land-a-real-branch',
  title: 'Land a Real Branch',
  repoName: 'SandCastles',
  briefing: [
    'Real repo, real history. On a team, main stays deployable because changes land through branches, never straight on main.',
    'Have your AI agent make one small change on a branch in SandCastles, merge it into main with a merge commit, and push. Then prove it here.',
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
      id: 'brief-merge',
      text: 'Tell it: "Switch to main, pull, merge my branch with git merge --no-ff so there\'s a merge commit, then push main." Or open a pull request and pick "Create a merge commit".',
    },
    {
      id: 'sync',
      text: 'In PowerShell, in your SandCastles folder, run git switch main, then git pull, so your copy matches GitHub before you paste anything.',
    },
  ],
  verifications: [
    {
      id: 'merge-landed',
      instruction:
        'Run git log --oneline --merges -1 and paste the line it prints. It shows only if main holds a merge commit. No line means the branch was never merged.',
      command: 'git log --oneline --merges -1',
      parser: 'log-oneline',
      check: { kind: 'minCommits', count: 1 },
    },
    {
      id: 'branch-commit',
      instruction:
        'Run git log --oneline --no-merges -1 and paste the line. It is the commit your agent made on the branch, and it should start with a type like feat: or fix:.',
      command: 'git log --oneline --no-merges -1',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
    },
    {
      id: 'main-clean',
      instruction:
        'Run git status and paste everything it prints. It should say "On branch main" and "nothing to commit, working tree clean".',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean' },
    },
  ],
} satisfies FieldMissionInput;
