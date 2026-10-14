import type { FieldMissionInput } from '../../game/missions/schema';

/**
 * Act 6's Field Mission (DESIGN.md section 8): Kyle has his own AI agent document one real
 * request to SandCastles' API in its README, through a pull request. Reading one request
 * and its response is the whole Act in miniature, and a vibe coder can do it by directing
 * an agent: the mission teaches what to ask for and how to check the answer, not how to
 * type it. Every command can be run by the agent, as long as Kyle sees its exact output.
 *
 * It targets the SandCastles working repo, not the public alpha, because the Act 4 and 5
 * Field Missions that create the alpha aren't built yet.
 *
 * Verification reads pasted output, checked in the browser, so it needs no GitHub token or
 * API key. Each check proves something this mission did: the README on main names a
 * request and a status code, its newest change there is a docs: commit (so it was merged),
 * and the local main is clean and the same as GitHub's. The last one is the usual safety
 * net: no secret file is tracked. Paste checks can't judge what the example says, so Kyle
 * reads it himself for keys and real user data, in the pull request, before merging.
 */
export const documentOneRequest = {
  id: 'document-one-request',
  title: 'Document One Request',
  repoName: 'SandCastles',
  briefing: [
    'Real repo, real API. Anyone using SandCastles should be able to see one request, what comes back, and the status code that says how it went.',
    'Have your own AI agent write it up in the README on a branch, check it against the real app, then merge it through a pull request. You direct; it types.',
  ],
  checklist: [
    {
      id: 'pick',
      text: 'Ask your agent to list the requests SandCastles handles, and pick one. A GET is easiest to check, because Chrome can open it. If there is no API yet, ask it to add a GET /health endpoint that returns 200 and {"status":"ok"}.',
    },
    {
      id: 'brief',
      text: 'Ask your agent: "On a new docs/ branch, add an API section to README.md for that request: the method and path, an example JSON response, and its status code. Use the real app\'s shape and status code, but replace real ids, names and emails with obvious fakes."',
    },
    {
      id: 'check',
      text: "Ask your agent to start the app and give you the URL, then open it in Chrome. Does the real response match the README, status code included? (Chrome's network tab shows the code.) If not, send your agent back.",
    },
    {
      id: 'no-secrets',
      text: "Read the example yourself: no keys, tokens, cookies, emails or real user data. Made-up values only. A checker can't judge this, and the README is public on GitHub.",
    },
    {
      id: 'ship',
      text: 'Ask your agent to commit it as "docs: document GET /health" (or your request), push the branch and open a pull request. Read the section in the PR on github.com, then squash and merge it.',
    },
    {
      id: 'sync',
      text: 'Ask your agent to switch back to main and pull, so your copy has the merged docs. Then do the checks below.',
    },
  ],
  verifications: [
    {
      id: 'readme-documents-request',
      instruction:
        'On main, in your SandCastles folder, ask your agent to run this and show you the exact output, or run it yourself in PowerShell. Paste it here. It lists the README lines that name a request or a status code.',
      command:
        "Select-String -Path README.md -Pattern 'GET /|POST /|PUT /|PATCH /|DELETE /|[1-5][0-9][0-9]'",
      parser: 'select-string',
      check: { kind: 'documentsRequest', file: 'README.md' },
    },
    {
      id: 'merged-docs-commit',
      instruction:
        "Run git log --oneline -1 origin/main -- README.md, or ask your agent to and show you the exact output, and paste the line. It is the newest README change on GitHub's main, so it should be your merged docs: commit.",
      command: 'git log --oneline -1 origin/main -- README.md',
      parser: 'log-oneline',
      check: { kind: 'newestCommitType', type: 'docs' },
    },
    {
      id: 'synced-with-github',
      instruction:
        'Run git status on main, or ask your agent to and show you the exact output, and paste all of it. It should say "working tree clean" and "up to date with \'origin/main\'": nothing left over, nothing unpushed.',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean', upstream: 'up-to-date' },
    },
    {
      id: 'no-secret-file',
      instruction:
        'Run git ls-files, or ask your agent to and show you the exact output, and paste all of it. It lists every file git tracks, and no secret file such as .env should be among them.',
      command: 'git ls-files',
      parser: 'ls-files',
      check: { kind: 'noTrackedSecrets' },
    },
  ],
} satisfies FieldMissionInput;
