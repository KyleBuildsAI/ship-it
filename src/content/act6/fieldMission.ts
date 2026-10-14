import type { FieldMissionInput } from '../../game/missions/schema';

/**
 * Act 6's Field Mission (DESIGN.md section 8): Kyle has his own AI agent document one real
 * request to SandCastles' API in its README, then pushes it. Reading one request and its
 * response is the whole Act in miniature, and a vibe coder can do it by directing an agent:
 * the mission teaches what to ask for and how to check the answer, not how to type it.
 *
 * Verification reads pasted PowerShell output, checked in the browser, so it needs no
 * GitHub token or API key. The checks prove what output can prove: the work is committed
 * with a Conventional Commit message, nothing is left uncommitted, and no secret file is
 * tracked (an API section is exactly where a real key tends to slip in). Reading the
 * README section itself is the last checklist step, done by Kyle on github.com.
 */
export const documentOneRequest = {
  id: 'document-one-request',
  title: 'Document One Request',
  repoName: 'SandCastles',
  briefing: [
    'Real repo, real API. Anyone using SandCastles should be able to see one request, what comes back, and the status code that says how it went.',
    'Have your own AI agent write it up in the README, check its work against the real app, then commit and push. You direct; it types.',
  ],
  checklist: [
    {
      id: 'pick',
      text: 'Pick one request SandCastles really handles, like loading the list of castles. If it has no API yet, ask your agent to add a GET /health endpoint that returns 200 and {"status":"ok"}.',
    },
    {
      id: 'brief',
      text: 'Ask your agent: "Add an API section to README.md for that request: the method and path, an example JSON response, and its status code. Use the real app, not a guess. No keys or tokens in it."',
    },
    {
      id: 'check',
      text: 'Run the app and make the request yourself (open the URL in Chrome). Does the real response match what the README says, status code included? If not, send your agent back.',
    },
    {
      id: 'ship',
      text: 'Ask your agent to commit it with a message like "docs: document the castles request" and push it. Then open README.md on github.com and read your new section.',
    },
  ],
  verifications: [
    {
      id: 'docs-commit',
      instruction:
        'In PowerShell, in your SandCastles folder, run git log --oneline -1 and paste the line. It should start with a type like docs: or feat:.',
      command: 'git log --oneline -1',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
    },
    {
      id: 'nothing-left-over',
      instruction:
        'Run git status and paste everything it prints. It should say "working tree clean", and "up to date with \'origin/main\'" once you have pushed.',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean' },
    },
    {
      id: 'no-key-committed',
      instruction:
        'Run git ls-files and paste everything it prints. It lists every file git tracks. .env must not be on it, so no API key went to GitHub with your docs.',
      command: 'git ls-files',
      parser: 'ls-files',
      check: { kind: 'noTrackedSecrets' },
    },
  ],
} satisfies FieldMissionInput;
