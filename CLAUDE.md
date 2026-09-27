# CLAUDE.md: Working rules for this repo

Read `DESIGN.md` before any task. It is the source of truth.

## Who you're working with

Kyle is learning professional software engineering through this repo. He directs AI well and is building fundamentals. Every PR is a lesson, so explain in plain language and never skip the teaching sections.

His machine: Windows 11, PowerShell, NVIDIA GPU, Chrome. Give every command in PowerShell syntax.

## Workflow for every change

1. Every unit of work has a GitHub issue. Create it with `gh issue create` if it doesn't exist.
2. Branch from an up-to-date `main`. Names: `feat/...`, `fix/...`, `chore/...`, `docs/...`, `test/...`, `refactor/...`.
3. Small, focused commits with Conventional Commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`). Never "wip" or "update files".
4. Before opening a PR, run locally and confirm all green: lint, typecheck, unit tests, build, e2e smoke.
5. Open the PR with `gh pr create` using the template. Link the issue (`Closes #N`).
6. **Stop after opening the PR.** Give Kyle the PR link and its three review questions. Do not merge. Do not start the next PR until Kyle says it's merged or tells you to keep going.
7. After merge: `git switch main`, `git pull`, delete the local branch, then continue.

Target PR size: under ~400 changed lines, excluding generated files, lockfiles, and mission content data. Split anything bigger.

`main` only ever receives changes through merged PRs. The single exception is the very first bootstrap commit.

## PR template (`.github/pull_request_template.md`)

```
## What changed

## Why

## How to test
Step-by-step, PowerShell, starting from "open a terminal in the repo folder".

## Concepts in this PR
3-5 plain-language bullets. Name the files to read first, in order.

## Before you merge, can you answer these?
1.
2.
3.
<details><summary>Answers</summary>

</details>

## Git commands I ran and why
One line each.
```

## Code rules

- TypeScript strict. No `any` without a comment explaining why.
- `engine/` is pure: no DOM, no three.js, no React. Every engine feature gets unit tests. Keep `engine/` coverage at 90%+.
- Missions are data in `src/content/`, validated by schema. No mission logic hardcoded in scenes.
- Grade by resulting state, never by exact command strings.
- Comments explain why, not what. Kyle reads this code, so prefer clear names over clever tricks.
- three.js stays pinned at exactly `0.184.0`. Don't bump any dependency's major version without asking.
- npm scripts must work in PowerShell.
- Anything that must survive restarts goes to IndexedDB (client) or a file (server). Never rely on in-memory state for progress, usage, or settings.

## Secrets

- Never commit keys, tokens, or `.env` files. `.env` is gitignored. When you add a variable, add its name (no value) to `.env.example`.
- The Anthropic key lives only in the mentor server. Never in client code. Never in `VITE_` variables.
- Never ask Kyle to paste a key or token into chat. Tell him which file to put it in and how.
- GitHub tokens Kyle enters in the game are stored in IndexedDB on his machine and only sent to `api.github.com`.
- gitleaks runs in CI. Don't disable or bypass it.

## Verify loop (every UI-affecting change)

1. Run the app and open it in Chrome.
2. Read the console. Errors and warnings must both be zero.
3. Take two screenshots a few seconds apart. They must differ (proves the render loop is live) and must match `DESIGN.md` section 14.
4. Note the backend (WebGPU or WebGL2 fallback) and console state in the PR.

## When to stop and ask

- `DESIGN.md` and the code disagree, or a requirement is ambiguous and expensive to redo.
- Anything that needs Kyle's accounts, keys, repo settings, or installs on his machine. Give the exact PowerShell command or click path, then wait.
- Any destructive git operation: force push, rewriting history on `main`, deleting remote branches.

Otherwise, make the reasonable call and note it in the PR under "Why".

## Keep docs current

If you change behavior described in `DESIGN.md`, update `DESIGN.md` in the same PR.
