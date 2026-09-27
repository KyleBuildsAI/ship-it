# SHIP IT: Design Spec

Status: v1.0 (2026-09-26). Owner: Kyle Coleman. Builder: Claude Code.

This document is the source of truth. If the code and this doc disagree, stop and ask Kyle which is right, then update this doc in the same PR.

---

## 1. Purpose

SHIP IT is a 3D browser game that is also a complete course in professional software engineering: Git, GitHub team workflow, testing and CI, how systems work, AI-native engineering, and interview prep.

It is built for one player: Kyle. The target outcome is being interview-ready for Applied AI Engineer and Forward Deployed Engineer roles at frontier AI labs.

## 2. Player profile

- 11+ years of IT and hardware repair experience, MIS degree, works in data analysis and automation.
- Builds large systems by directing AI. Flagship project: SandCastles, a self-hosted multi-agent orchestration platform.
- Building fundamentals in reading and writing code without AI, and in professional Git/GitHub workflow.
- Very visual. Learns by seeing and doing, not by reading walls of text.
- Machine: Windows 11, PowerShell, NVIDIA GPU, Chrome.
- Gaps to close: presenting real-world experience as engineering stories, and showing professional-grade project evidence.

## 3. Design pillars (non-negotiable)

1. **Show, don't lecture.** Every concept has a visual. Max ~60 words of text on screen at once.
2. **Two-way mapping.** Every world action shows the real command. Every command animates the world.
3. **Grade by resulting state, not exact strings.** Any valid path to the target state passes.
4. **No-AI Drills are real.** Mentor off, no hints, recall instead of recognition.
5. **Real work counts.** Field Missions happen on Kyle's real repos (mainly SandCastles) and get verified.
6. **Ask before you build.** Every mission trains clarifying questions.
7. **Persistent.** Progress survives browser restarts and reboots. Nothing important lives only in memory.
8. **The repo is a lesson.** This game is built through issues, branches, PRs, and CI.

## 4. Premise and world

### Premise
Kyle joins **Quillwork AI**, a fictional AI startup, as an intern and ranks up:
Intern -> Junior -> Mid -> Senior -> Staff.

### Cast (all fictional)
- **Sage**: staff engineer and mentor. AI-powered NPC (see section 9).
- **Marco**: product manager. Hands out vague tickets in Question Rounds.
- **Dex**: the deploy bot. Boss-level antagonist. Builds from a clean checkout on a timer and ships only what is committed.
- **Rook** (M2+): code reviewer. Leaves review comments on Kyle's work.

### Hub: Campus
A night-time floating island HQ. Contains:
- Portals to each Act (locked until prerequisites are met, except placement tests).
- **Standup Board**: the daily review queue.
- **Trophy Wall**: rank, stats, completed Acts.
- **Sage's desk**: mentor chat and settings.

### Git World visual language (reused everywhere)
| Git concept | In-world object |
|---|---|
| Working tree | **Workbench**. Files are crates. Modified crates glow amber. Untracked crates have no label. |
| Staging area (index) | **Loading Dock**. `git add` moves a crate from bench to dock. |
| Repository | **Vault**. `git commit` seals the dock's crates into a snapshot. |
| Commit | A floating **platform** labeled with short hash and message. |
| Parent links | **Bridges** between platforms. |
| Branch | A colored **banner** planted on a platform. A pointer, not a path. Moving a branch moves the banner. |
| HEAD | The **player avatar**. Detached HEAD: avatar on a platform with no banner, ground visibly cracked. |
| Merge | Two bridges joining into one platform. |
| Conflict | Two crates fighting for the same slot, sparking. Resolved in the editor. |
| .gitignore | A **blocklist sign**. Ignored crates are greyed out and cannot go to the dock. |
| Reflog | **Footprints** showing everywhere HEAD has been. Walking back along them = recovery. |
| Remote (Act 4) | A second island, **origin**, across the water. Push and fetch are ferries carrying platforms. |

## 5. Mission loop

Each Act contains: placement test, 3-6 missions, a boss, a Field Mission, and review items.

### Mission steps
1. **Briefing**: 60-120 second animated scene, 1-3 captions, one diagram moment. Skippable and replayable.
2. **Sim**: guided tasks in the sandbox (terminal + 3D world + file editor). Sage hints available.
3. **No-AI Drill**: 5-10 timed scenarios. Mentor offline. Scored on resulting state. Misses go to the review queue.
4. **Question Round**: Marco hands over a vague ticket. Kyle picks up to 3 of ~8 candidate clarifying questions. Each candidate has a hidden quality tag (strong / okay / weak) and a rationale shown afterward. Optional free-text question graded by Sage.

### Act-level
- **Placement test**: 8-12 drill scenarios covering the Act. Score 85%+ = "Tested out": Act marked complete with reduced XP, still replayable.
- **Boss**: timed, multi-step scenario with a twist.
- **Field Mission**: real task on a real repo, with a checklist and verification (section 8).

## 6. Progression and systems

- **XP** for every completed step. Ranks by Act completion: Intern (Acts 1-2), Junior (3-4), Mid (5-6), Senior (7), Staff (8).
- **Review queue**: missed drill items scheduled with a simple SM-2 style algorithm. Surfaced at the Standup Board as a daily set of 5-10 items.
- **Stats**: drill accuracy, average time per drill, days practiced. No punishment for missed days.
- **Skill tree** (M2+): one node per concept. Lit when mastered (90%+ drill accuracy over the last 10 attempts).
- **Saves**: IndexedDB, versioned schema with migrations, autosave after every step, manual export/import to a JSON file from Settings. Must survive browser restarts and reboots.
- **Settings**: graphics quality, audio volume, mentor on/off, mentor model per mode, reduced motion, text size, GitHub token (M3+).

## 7. Git simulation engine (`src/engine/git`)

The heart of the game. Treat it like production code.

- Pure TypeScript. No DOM, no three.js, no React.
- Deterministic: injected clock and hash function so tests are repeatable.
- **Models**: blobs, trees (path -> content map is fine), commits (id, parents, message, author, timestamp, snapshot), refs (branches, tags), HEAD (attached or detached), index, working tree, reflog. Later: remotes, stash.
- **Hashes**: stable content hashes, displayed as 7 characters.
- **Output**: realistic git-style text output and error messages.
- **Events**: emits typed events (`staged`, `unstaged`, `committed`, `branchMoved`, `headMoved`, `conflict`, etc.). The 3D world subscribes. The engine never imports anything from the game.
- **State queries for grading**: `isClean()`, `stagedPaths()`, `untrackedPaths()`, `log(ref)`, `fileAt(ref, path)`, and similar. Mission success = predicates over state.
- **Fixture builder** for concise test and mission setup, e.g. `repo().commit('init', files).modify('app.ts').untracked('.env')`.

### Command coverage by milestone
- **M1 (Act 2)**: `init`, `status`, `add` (paths, `.`, `-A`), `restore`, `restore --staged`, `rm`, `rm --cached`, `mv`, `commit -m`, `commit -am`, `log` (`--oneline`, `--graph`, `-n`), `show`, `diff`, `diff --staged`, `revert`, `reset --soft/--mixed/--hard`, `reflog`, `.gitignore` (basic globs).
- **M2 (Act 3)**: `branch`, `switch`, `switch -c`, `checkout` (legacy forms), `merge` (fast-forward, three-way, conflicts with markers), `merge --abort`, `rebase` (non-interactive), `cherry-pick`, `stash push/pop/list`, `tag`, `bisect start/good/bad/reset`.
- **M3 (Act 4)**: `remote add`, `fetch`, `pull` (merge and `--rebase`), `push` (including `-u` and rejected non-fast-forward), `clone` of a scenario remote.

### Shell (`src/engine/shell`)
Minimal commands that also work in PowerShell so habits transfer: `pwd`, `ls`, `cd`, `cat`, `mkdir`, `echo "text" > file`, `echo "text" >> file`, `rm` (files), `clear`, `help`, `history`.

Unknown commands get a helpful message pointing to the relevant briefing.

## 8. Field Missions

Real tasks on Kyle's real repos. Primary target: the SandCastles working repo. From Act 4: the SandCastles public alpha repo.

### Verification
- **M1: paste verification.** Kyle runs a command in PowerShell on the real repo (e.g. `git status`, `git log --oneline -10`) and pastes the output. The game parses it and checks predicates. Parsers live in `src/engine/verify` with unit tests.
  - Understood pastes: `git status` (default, `-s`, `-sb`, `--porcelain`) and `git log --oneline` (with or without `--graph` and `--decorate`), which `detectPasteKind` tells apart, plus `git ls-files` for the tracked-secrets check. A copied prompt or typed `git` command line, CRLF endings, color codes, and the pager's `(END)` are stripped first.
  - Checks: clean tree, Conventional Commit ratio (git's own merge subjects don't count), tracked secret files (`.env` yes, `.env.example` no), and `.gitignore` suggestions for build output.
  - Tests run against genuine git output saved in `src/engine/verify/fixtures/`. `capture.ps1` there rebuilds it with real git, and the sandbox's own output must parse the same way.
- **M3+: GitHub API verification.** Fine-grained personal access token, read-only, scoped to the target repos. Stored in IndexedDB on Kyle's machine only. Never committed. Only ever sent to `api.github.com`. The Settings screen explains the scopes in plain language.

### Field Mission map
| Act | Field Mission |
|---|---|
| 1 | Map SandCastles' environment: where it runs, ports, env var names (never values). Written up as a README section. |
| 2 | **Clean the dirty tree.** Commit outstanding SandCastles work in logical commits with conventional messages. Add .gitignore entries for build output and secrets. End with a clean `git status`. (Based on a real incident where deploys built from clean checkouts silently dropped uncommitted work.) |
| 3 | Use feature branches for all SandCastles work. Land one branch by rebase and one by merge. Explain the difference in the commit or PR text. |
| 4 | Create the sanitized public alpha repo. Open issues for the next 3 features. Every change via PR. Release v0.1.0 with notes. |
| 5 | Add tests and CI to the alpha (self-hosted runner). CI badge in README. Secret scanning on. |
| 6 | Architecture diagram and a one-command setup doc a stranger can follow. |
| 7 | Turn the Tidepool concept into a real eval suite. Prompt-injection hardening on one agent tool. |
| 8 | SandCastles deep-dive: defend the architecture against the interviewer. |

## 9. Sage (AI mentor)

- Local mentor server in `/server` (Node + TypeScript). **The API key never reaches the browser.**
- Official Anthropic TypeScript SDK. Verify model IDs against docs.claude.com before first use.
- `.env` (gitignored) with `.env.example` committed (names only):
  - `ANTHROPIC_API_KEY`
  - `MENTOR_MODEL_DEFAULT=claude-sonnet-5`
  - `MENTOR_MODEL_INTERVIEW=claude-opus-5-5`
  - `MENTOR_DAILY_CALL_CAP` (and/or a daily spend estimate cap)
  - `MENTOR_BASE_URL` (optional): route through Kyle's LiteLLM gateway. Implement only after confirming LiteLLM exposes an Anthropic-compatible Messages endpoint; otherwise skip and note it in the PR.

### Modes (`POST /api/mentor` with `{ mode, context }`)
- **hint**: hint ladder. Level 1: a question back. Level 2: the concept. Level 3: the command with explanation. Never skips levels.
- **grade_question**: grades Kyle's free-text clarifying question against the ticket rubric. Returns JSON `{ score: 0-3, whyItMatters, betterVersion }`.
- **explain**: explains a mistake after a drill ends (never during).
- **interview** (M5, Act 8 and Experience Vault): uses the interview model. Asks follow-ups, pushes on weak answers, scores against a rubric.

### Rules
- System prompts live in `/server/prompts/*.md` so Kyle can read and tune them.
- Sage is unavailable during No-AI Drills and placement tests: the client never calls it, and the server rejects calls tagged with a drill session.
- **Cost guard**: usage tracked in a local JSON file (persists across restarts, gitignored), shown in the HUD and Settings. Hard stop at the daily cap.
- **Offline behavior**: if the server is unreachable or has no key (always the case on the GitHub Pages build), Sage shows "offline", hints fall back to pre-written hint ladders in mission data, free-text grading is hidden, and multiple-choice Question Rounds still work. The game stays fully playable.

## 10. Content format

- Missions are typed data in `src/content/actN/*.ts`, never hardcoded in scenes.
- A schema (zod or equivalent) validates every mission in tests.
- **Mission object**: `id`, `act`, `title`, `briefing` (scene id + captions), `initialRepoState` (fixture), `steps` (instruction, success predicate, hint ladder), `drills` (scenario text, setup fixture, success predicate), `questionRound` (ticket, candidates with quality tag + rationale, rubric for free text), `xp`.

## 11. Curriculum

### Act 1: The Machine
PowerShell, filesystem, paths, PATH, environment variables, processes, ports, package managers (winget, npm, pip).
Boss: **"Works on My Machine"**: diagnose a broken dev setup from symptoms.

### Act 2: Git Core (M1)
Three areas, status, add, commit, log, diff, .gitignore, commit hygiene, undo.
- 2.1 **Three Rooms**: `init`, `status`, `add`, `commit` (Workbench / Loading Dock / Vault)
- 2.2 **Reading History**: `log`, `show`, `diff`, `diff --staged`
- 2.3 **Good Commits**: atomic commits, Conventional Commit messages, `commit -am` and when not to use it
- 2.4 **The Ignore List**: `.gitignore`, `rm --cached`, secrets hygiene
- 2.5 **Undo Everything**: `restore`, `revert`, `reset` modes, reflog recovery

Boss: **"The Dirty Tree"**: Dex deploys from a clean checkout in 3:00. The Workbench has ~40 modified and untracked files. Commit the right things in sensible commits, without committing `.env` or build output, before the timer hits zero. Twist at 1:00: Dex reports a missing file that was never tracked.

### Act 3: Branching
Pointers, switch, merge (fast-forward and three-way), conflicts, rebase vs merge, cherry-pick, stash, tags, bisect.
Boss: **"Conflict Storm"**.

### Act 4: GitHub Team Flow
Remotes, fetch/pull/push, forks, issues, PRs, review etiquette, protected branches, CODEOWNERS, releases, semantic versioning, changelogs.
Boss: **"Rejected Push"** at 5pm on release day.

### Act 5: Quality Gates
Unit, integration, and end-to-end tests. Linting, types, GitHub Actions, self-hosted runners, deploys, secrets management, dependency updates.
Boss: **"Red CI"**: main is broken. Find the commit, then fix forward or revert.

### Act 6: How Systems Work
HTTP, REST, JSON, auth (API keys, OAuth, sessions), SQL basics, indexes, caching, queues, containers, cloud basics, logs, reading stack traces.
Boss: **"The 3am Page"**: incident triage from logs and metrics.

### Act 7: AI-Native Engineering
Writing specs for agents, reviewing AI-written diffs, tests as guardrails, evals, tool use, context management, prompt injection, secrets and permissions, cost and latency trade-offs.
Boss: **"The Agent Went Rogue"**: an agent's PR passes CI but is subtly wrong.

### Act 8: The Loop
Live Python coding (no AI), debugging round, system design, customer scenario (forward-deployed style), project deep-dive (SandCastles), values round.
Boss: a full mock interview loop.

### Cross-Act features
- **Code Review mini-game (M2)**: diffs in a review panel. Click lines with bugs, pick the issue type, write a comment. Includes AI-written diffs with plausible-looking mistakes.
- **Python Arena (M5)**: Pyodide in a Web Worker. Practical problems (parse logs, transform JSON, rate limiter, small API handler) with hidden tests. Timer, no mentor.
- **Experience Vault (M5)**: Kyle writes stories from IT work, freelance repair, day-job automation, and SandCastles in STAR format. Sage (interview mode) grills them. Stories and scores saved over time.

## 12. Tech stack

- Vite + TypeScript (strict), npm, Node LTS.
- **three.js pinned to exactly `0.184.0`** (no `^` or `~`). Import from `three/webgpu`, `three/tsl`, and `three/addons/...`. One three core only (the WebGPU build) to avoid duplicate-module bugs.
- `WebGPURenderer` with an explicit `navigator.gpu.requestAdapter()` probe and `forceWebGL` fallback. `await renderer.init()` before first render. `renderer.setAnimationLoop` (never raw requestAnimationFrame). Pixel ratio clamped to 2.
- Post-processing via TSL: bloom + vignette minimum. Film grain and RGB shift very subtle or off (text-heavy game). Wrapped in try/catch, degrading to direct render on failure.
- UI overlays: React + TypeScript (HUD, terminal panel, editor, menus). The 3D world is imperative three.js, not react-three-fiber.
- Terminal: xterm.js. Editor: CodeMirror 6.
- Storage: IndexedDB (Dexie or idb).
- Tests: Vitest with coverage; Playwright smoke test.
- ESLint + Prettier.
- CI: GitHub Actions on GitHub-hosted runners. Deploy: GitHub Pages via Actions (Vite `base` set to the repo subpath).
- Secret scanning in CI: gitleaks.
- Mentor server: Node + TypeScript, small HTTP framework (Hono or Express), `@anthropic-ai/sdk`, dotenv. `npm run dev` runs Vite and the server together; Vite proxies `/api` to the server.
- All npm scripts must work in PowerShell on Windows 11. No bash-only syntax.

## 13. Architecture

```
ship-it/
  DESIGN.md  CLAUDE.md  README.md  .env.example  .gitignore
  .github/
    workflows/ci.yml
    workflows/deploy.yml
    pull_request_template.md
  src/
    main.tsx
    engine/git/        pure TS git simulation + tests
    engine/shell/      shell commands + parser + tests
    engine/verify/     Field Mission output parsers + tests
    game/world/        three.js scenes (Campus, Git World), renderer boot, post
    game/missions/     mission runner, grading, progression, review queue
    game/save/         IndexedDB, schema versions, migrations, export/import
    ui/                React HUD, terminal, editor, menus, settings
    mentor/            client for /api/mentor + offline fallback
    content/act1..act8 mission data
  server/
    index.ts
    prompts/*.md
    usage.json         (gitignored)
  tests/e2e/
```

**Dependency rule:** `engine/` imports nothing from `game/`, `ui/`, `mentor/`, or three.js. `game/` and `ui/` talk to `engine/` only through its public API, events, and queries.

## 14. Visual and polish bar

- Dark, atmospheric night campus. Fog or depth falloff. Key + rim + low ambient lighting. Bloom on glowing crates, banners, and portals.
- Glassmorphism UI panels (blurred translucent backgrounds, 1px subtle strokes, rounded corners).
- Terminal is readable: monospace, 14px+, high contrast. UI text never goes through post effects.
- **Zero console errors and zero warnings** in dev and production builds.
- Motion from the first frame. A static opening screen reads as broken.
- Target 60fps on an NVIDIA desktop GPU. Respect the reduced-motion setting.
- Dev status badge: backend (WebGPU / WebGL2), three.js revision, mentor state, save state.
- Controls: third-person camera with damped orbit, WASD + mouse, click-to-walk. Focus rules: typing in the terminal or editor never moves the avatar.
- **Verify loop** after every UI-affecting change: run the app in Chrome, read the console for errors and warnings, take two screenshots a few seconds apart (they must differ), compare against this section.

## 15. Milestones

| Milestone | Scope |
|---|---|
| **M1** | Vertical slice. Scaffold, CI, Pages deploy, save system, Campus hub, Git World (three areas + commit path), git engine (M1 commands), shell, terminal, editor, mission runner, review queue, Sage server (hint + grade_question), Act 2 complete. |
| **M2** | Acts 1 and 3. Branch/merge/rebase visuals. Code Review mini-game. Skill tree. |
| **M3** | Act 4. Remote island. GitHub API Field Mission verification. Issue and PR simulations. |
| **M4** | Acts 5 and 6. CI simulator. Incident boss. Systems visuals. |
| **M5** | Acts 7 and 8. Python Arena. Experience Vault. Interview mode. |
| **M6** | Polish: audio, onboarding, performance, accessibility, content QA. |

### M1 acceptance criteria
- On Windows 11 PowerShell: `npm install`, then `npm run dev` launches the game and the mentor server; the game opens in Chrome.
- Renders on WebGPU and falls back cleanly to WebGL2. Zero console errors and warnings. 60fps target.
- Act 2 fully playable start to finish: placement test, missions 2.1-2.5, boss, Field Mission.
- Drills pass with any valid command sequence that reaches the target state.
- Progress survives closing the browser and rebooting. Export/import round-trips.
- Sage works locally with a key. With no key, and on the Pages build, the game is fully playable using pre-written hints.
- Sage is unreachable during drills and placement tests.
- CI green on main. Pages URL live. `engine/` coverage 90%+.
- Every PR follows the template, including the "can you answer these" questions.

## 16. Non-goals

- Multiplayer, accounts, leaderboards.
- Mobile support (desktop Chrome first).
- Running real git inside the browser.
- Monetization.
