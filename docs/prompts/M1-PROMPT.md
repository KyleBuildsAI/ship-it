You're building SHIP IT, a 3D browser game that teaches me professional software engineering. This session builds Milestone 1: a playable vertical slice.

Read `DESIGN.md` and `CLAUDE.md` in this folder first, fully. They are the source of truth. Follow the `CLAUDE.md` workflow for every change.

## Step 0: Prerequisites (check, don't assume)

- Check that git, Node LTS, npm, and GitHub CLI (`gh`) are installed, and that `gh auth status` shows me logged in.
- If anything is missing, give me the exact PowerShell command (winget preferred) and wait for me to run it.
- If `gh` isn't authenticated, tell me to run `gh auth login` and wait.
- For every dependency you plan to use, check its current stable version before installing. Exception: three.js stays pinned at exactly `0.184.0`.

## Step 1: Bootstrap the repo

- `git init` in this folder with default branch `main`.
- Make the first commit directly on `main` (the only direct commit this repo will ever get): `README.md` (one paragraph + how to run), `DESIGN.md`, `CLAUDE.md`, `.gitignore` (node_modules, dist, .env, server/usage.json, coverage, Playwright artifacts), `.env.example`.
- Create a public GitHub repo named `ship-it` with `gh repo create` and push `main`.
- Enable GitHub Pages with Source = GitHub Actions (via `gh api` if permitted; otherwise give me the exact click path and wait).
- Then explain to me in 5 short lines what just happened and why this is the only commit without a PR.

## Step 2: Build M1 as small PRs, in this order

Each one gets its own issue, branch, and PR. Stop after each PR per `CLAUDE.md`.

1. **chore/scaffold**: Vite + TypeScript strict + React overlay + three.js boot (WebGPU with WebGL2 fallback, dev status badge, post stack per `DESIGN.md` section 12), Vite `base` for Pages, ESLint, Prettier, Vitest, Playwright smoke test, CI workflow (lint, typecheck, unit tests, build, e2e smoke, gitleaks), Pages deploy workflow, PR template. The page shows an animated placeholder scene.
2. **feat/git-engine-core**: `engine/git` with the M1 command set (`DESIGN.md` section 7), fixture builder, state queries, typed events, git-style output and errors. Heavy unit tests.
3. **feat/shell-terminal**: `engine/shell`, xterm.js terminal panel, CodeMirror file editor panel, command history, focus rules.
4. **feat/world**: Campus hub and Git World (Workbench, Loading Dock, Vault, commit platforms and bridges, branch banner, HEAD avatar, reflog footprints), driven by engine events. Every command animates the world; every world interaction shows the equivalent command.
5. **feat/save-progression**: IndexedDB saves with schema version and migrations, autosave, export/import, XP and ranks, SM-2 style review queue, Standup Board, Settings screen.
6. **feat/mission-runner**: mission schema + validation, runners for Briefing, Sim, No-AI Drill, Question Round, placement test, timed boss, and Field Mission with paste-output verification (`engine/verify` parsers + tests).
7. **feat/mentor**: `/server` with Sage (`hint` and `grade_question` modes), prompts in `server/prompts/`, cost guard with a persistent usage file, Vite `/api` proxy, offline fallback, and `npm run dev` starting both. Model IDs come from `.env`; verify current IDs at docs.claude.com. When this PR is ready, tell me step by step how to create `.env` and where my API key goes. I'll add it myself; never ask me to paste it into chat.
8. **feat/act-2-content**: all of Act 2 per `DESIGN.md` section 11: placement test, missions 2.1-2.5 (each with sim steps, drills, and a Question Round), "The Dirty Tree" boss, and the SandCastles clean-tree Field Mission.
9. **chore/m1-polish**: run the verify loop on every screen, performance pass, clean console, README with screenshots and how-to-run, confirm the Pages build works with Sage offline.

## Done means

All of `DESIGN.md` section 15 "M1 acceptance criteria" pass.

When M1 is complete, give me:
- The GitHub Pages link.
- 5 bullets on what I should now understand from building and playing M1.
- Anything you deferred, with the reason.
