# SHIP IT: Design Spec

Status: v1.0 (2026-09-26). Owner: Kyle Coleman. Builder: Claude Code.

This document is the source of truth. If the code and this doc disagree, stop and ask Kyle which is right, then update this doc in the same PR.

---

## 1. Purpose

SHIP IT is a 3D browser game that is also a complete course in professional software engineering for the era of directing AI coding agents: the machine, Git, GitHub team workflow, testing and CI, how systems work, AI-native engineering, and interview prep. It teaches the principles behind what an agent does, so Kyle can direct it well and catch its mistakes, rather than drilling syntax.

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
2. **Two-way mapping.** Every world action, and every action an agent takes, shows the real command and its real output. Every command animates the world.
3. **Grade by resulting state, not exact strings.** Any valid path to the target state passes. Checks of understanding are graded by state too: an answer is right when the engine says its claim is true.
4. **Drills are real.** Mentor off, no hints, timed. Directed Acts use judgment drills (predict, diagnose, fix, order, approve, spot) with no typing and answer keys the engine works out. Typed Acts keep No-AI command drills.
5. **Real work counts.** Field Missions happen on Kyle's real repos (mainly SandCastles) and get verified.
6. **Ask before you build.** Every mission trains clarifying questions.
7. **Persistent.** Progress survives browser restarts and reboots. Nothing important lives only in memory.
8. **The repo is a lesson.** This game is built through issues, branches, PRs, and CI.
9. **Direct, then check.** For the era of AI coding agents: in directed Acts Kyle plans, approves and verifies, and an in-game agent types. Typing is never required there. The agent is scripted content, never an LLM, so everything works without an API key.

## 4. Premise and world

### Premise
Kyle joins **Quillwork AI**, a fictional AI startup, as an intern and ranks up:
Intern -> Junior -> Mid -> Senior -> Staff.

### Cast (all fictional)
- **Sage**: staff engineer and mentor. AI-powered NPC (see section 9).
- **Marco**: product manager. Hands out vague tickets in Question Rounds.
- **Dex**: the deploy bot. Boss-level antagonist. Builds from a clean checkout on a timer and ships only what is committed.
- **Rook** (M2+): code reviewer. Leaves review comments on Kyle's work.
- **Otto** (Act 1, in progress): Quillwork's coding agent, a small magenta drone. He types; Kyle directs and checks. Fast, literal, confident and sometimes wrong: every slip is a real agent mistake (wrong place, overclaiming, too broad, leaking a secret). Scripted for the course, and says so.

### Hub: Campus
A night-time floating island HQ. Contains:
- Portals to each Act (locked until prerequisites are met, except placement tests). An open portal leads to its own Act's island: walk into its ring, or click it and the avatar walks there. Acts with an island have an open portal (`ZONE_FOR_ACT` in `src/game/world/zones.ts`).
- **Standup Board**: the daily review queue.
- **Trophy Wall**: rank, stats, completed Acts.
- **Sage's desk**: mentor chat and settings.
- In M1 these three are HUD menus (Standup, Trophies, Settings) reachable from anywhere, next to an **Acts** button that opens an Act menu outside its island too. It opens on the first Act that isn't complete and still has work left (`recommendedAct`): a mission, boss or Field Mission not done yet. So once an early-access Act's built missions are done, it opens on the next Act. There's a tab per Act once more than one ships. Standing on an Act's island shows that Act's menu. Mentor chat arrives with later modes.
- **The catalog holds every Act** (`src/content/index.ts` `ACTS`, loaded by `setCatalog`). Activities carry their Act number, so placement tests, bosses, Field Missions and progress are all per Act, and reviews draw from every Act. `validateCatalog` keeps mission, drill, boss and Field Mission ids unique across Acts, because the save and the review queue refer to them by id alone. Each Act's placement test has its own pitch line.
- **First-run tutorial** (M2): a card at the top left (over the locked portals, so the open ones stay in view) teaches the controls by doing, one step at a time: walk, jump, look around, run a command, hide and show the terminal, enter an Act. Each step advances when the player has done it (counters in the world and HUD stores; logic in `src/game/tutorial.ts`), never on a "Next" button. Skippable; Settings can replay it. Finishing or skipping is saved, so it runs once per save.

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
2. **Sim**: guided tasks in the sandbox (terminal + 3D world + file editor). Sage hints available. In a directed Act, each step is: **Direct** (pick one of 2-3 request cards, or say it your own way), **Run** (Otto types real commands; he pauses for approval before risky lines, showing the effects worked out by a dry run and a ghost in the world), **Check** (Otto claims "Done"; Kyle answers one question about the result, using read-only looks as evidence) and **Result** (the checklist, the slip, stars for Plan, Safety and Check). A miss opens a fix round: Kyle directs Otto to clean up. Full design: `docs/act1-directed.md`.
3. **Drill**: 5-10 timed scenarios. Mentor offline. Scored on resulting state. Misses go to the review queue. In a directed Act these are judgment drills: a short scene plays, then Kyle predicts what a line will do, diagnoses why something broke, picks the right fix, or allows or denies a line. The clock starts after the scene.
4. **Question Round**: Marco hands over a vague ticket. Kyle picks up to 3 of ~8 candidate clarifying questions. Each candidate has a hidden quality tag (strong / okay / weak) and a rationale shown afterward. Optional free-text question graded by Sage.

### Act-level
- **Placement test**: 8-12 drill scenarios covering the Act. Score 85%+ = "Tested out": Act marked complete with reduced XP, still replayable.
- **Boss**: timed, multi-step scenario with a twist.
- **Field Mission**: real task on a real repo, with a checklist and verification (section 8).
- **Early access**: an Act can ship before it's finished. It plays the missions built so far, lists the rest as coming soon, and gains its boss and Field Mission as they're built. It has no placement test, because testing out would skip missions that don't exist yet, and it never counts as complete until early access ends.

## 6. Progression and systems

- **XP** for every completed step. Ranks by Act completion: Intern (Acts 1-2), Junior (3-4), Mid (5-6), Senior (7), Staff (8). The rank comes from the highest completed Act, so finishing Act 2 promotes to Junior, Act 4 to Mid, Act 6 to Senior, and Act 7 to Staff. Testing out of an Act grants 50% of its mission XP.
- **Review queue**: missed drill items scheduled with a simple SM-2 style algorithm. Surfaced at the Standup Board as a daily set of 5-10 items. Gaps between reviews are capped at one year.
- **Stats**: drill accuracy, average time per drill, days practiced. No punishment for missed days.
- **Skill tree** (M2+): one node per concept. Lit when mastered (90%+ drill accuracy over the last 10 attempts; a concept with fewer than 10 attempts is not mastered yet).
- **Saves**: IndexedDB, versioned schema with migrations (version 2 added the tutorial's finish time; older saves get the tutorial once), autosave after every step (debounced 500 ms, so a burst of steps is one write), manual export/import to a JSON file from Settings. Must survive browser restarts and reboots. One tab owns the save at a time: a new tab asks the current owner (BroadcastChannel) to store anything pending and release a Web Lock, then loads; an unresponsive owner loses the lock after 1.5 s. Older tabs stop writing and show a notice.
- **Music**: a shuffled playlist of ten calm classical recordings (`src/content/music.ts`), each checked for a license on the recording itself (CC0, CC BY 3.0 or public domain) and streamed from Wikimedia Commons, so no audio files live in the repo. It starts on the first click or key press (browser autoplay rules), fades each piece in, leaves 4 s of silence between pieces, pauses while the tab is hidden, and stops in a tab without the save. Volume comes from `settings.audioVolume` (0 is off, at 40% of full scale so it stays in the background); the HUD's ♪ Music button mutes and restores it. Settings shows what's playing and every credit. End-to-end tests answer the music requests with generated silence.
- **Settings**: graphics quality, music volume, mentor on/off, mentor model per mode, reduced motion, text size, replay the tutorial, GitHub token (M3+). The GitHub token is stored apart from the save data, so an exported save file never contains it.

## 7. Git simulation engine (`src/engine/git`)

The heart of the game. Treat it like production code.

- Pure TypeScript. No DOM, no three.js, no React.
- Deterministic: injected clock and hash function so tests are repeatable.
- **Models**: blobs, trees (path -> content map is fine), commits (id, parents, message, author, timestamp, snapshot), refs (branches, tags), HEAD (attached or detached), index, working tree, reflog. Later: remotes, stash.
- **Hashes**: stable content hashes, displayed as 7 characters.
- **Output**: realistic git-style text output and error messages.
- **Events**: emits typed events (`staged`, `unstaged`, `committed`, `branchMoved`, `headMoved`, `conflict`, etc.). The 3D world subscribes. The engine never imports anything from the game.
- **State queries for grading**: `isClean()`, `stagedPaths()`, `untrackedPaths()`, `log(ref)`, `fileAt(ref, path)`, and similar. Mission success = predicates over state.
- **Fixture builder** for concise test and mission setup, e.g. `repo().commit('init', files).modify('app.ts').untracked('.env')`. It lives in `src/engine/fixtures.ts` (re-exported from `engine/git/fixtures.ts`). Act 1 setups start with `windows()`, a stock Windows 11 laptop with the project folder mounted at `~\quillwork\app` (git works there), then shape it: `files`/`write`/`append`/`delete` take drive paths, and `mkdir`, `session`, `cd`, `env(scope, name, value)`, `pathAdd(scope, dir, at)` and `restartTerminals` set up folders, terminals and variables. A terminal opened with `session()` keeps the variables it copied, so a later install or saved change leaves it stale on purpose; a setup that opens none gets one at the end. Boss twists apply the same steps to a live laptop, and a test proves both routes end identical.
- **Working tree as an interface** (`src/engine/fs/fileTree.ts`): git and the shell read files through `FileTree`. `VirtualFs` is a tree of its own; `SubtreeFs` shows one folder of a bigger tree as if it were the whole tree, with the same results and error paths. Act 1's simulated drive mounts Act 2's project folder this way, so git works inside it and every write lands on the drive.

### Command coverage by milestone
- **M1 (Act 2)**: `init`, `status`, `add` (paths, `.`, `-A`), `restore`, `restore --staged`, `rm`, `rm --cached`, `mv`, `commit -m`, `commit -am`, `log` (`--oneline`, `--graph`, `-n`), `show`, `diff`, `diff --staged`, `revert`, `reset --soft/--mixed/--hard`, `reflog`, `.gitignore` (basic globs).
- **M2 (Act 3)**: `branch`, `switch`, `switch -c`, `checkout` (legacy forms), `merge` (fast-forward, three-way, conflicts with markers), `merge --abort`, `rebase` (non-interactive), `cherry-pick`, `stash push/pop/list`, `tag`, `bisect start/good/bad/reset`.
- **M3 (Act 4)**: `remote add`, `fetch`, `pull` (merge and `--rebase`), `push` (including `-u` and rejected non-fast-forward), `clone` of a scenario remote.

### Shell (`src/engine/shell`)
Minimal commands that also work in PowerShell so habits transfer: `pwd`, `ls`, `cd`, `cat`, `mkdir`, `echo "text" > file`, `echo "text" >> file`, `rm` (files), `clear`, `help`, `history`.

Unknown commands get a helpful message pointing to the relevant briefing.

**Act 1 fidelity:** Act 1's shell simulates the player's own PowerShell 7.6, so its output is checked against the real thing. `src/engine/shell/machine/fixtures/capture-shell.ps1` runs real commands against a throwaway folder and saves their output (listings, `Get-Command`, ports, tool versions, and each error as a typed command prints it) as `.txt` captures. It pins plain text, ConciseView and en-US, dates every item 2026-09-27 10:15, and rewrites the player's real paths as `C:\Users\kyle` and the process id as `{PID}`, so the captures are stable and personal details never reach the repo. Deterministic captures are matched byte for byte; machine-dependent ones (processes, versions) by their shape. Re-run the script after a PowerShell upgrade and review the diff.

### Machine (`src/engine/machine`, Act 1)

Act 1's simulated Windows laptop, pure TypeScript like the git engine.

- **Drive:** one `VirtualFs` for C:, with canonical paths relative to its root (`Users/kyle/notes`). `winPath.ts` turns typed Windows paths (`C:\Users`, `..\web`, `~\notes`) into canonical ones and back, case-insensitively as Windows does, and reports a missing drive (`D:`) instead of guessing.
- **Environment variables** (`EnvTable`): case-insensitive names that keep their first spelling; an empty value deletes, as on Windows. Three scopes: `session` (one terminal tab), `user` (saved for this user) and `machine` (saved for everyone, admin only, so the player's writes are denied).
- **Terminal tabs** (`Session`): each is a pwsh process with its own id, folder, and a copy of the saved variables made when it opened. That copy is the Act's central lesson: a saved change only reaches tabs opened afterwards. A new tab's Path joins the saved Machine Path and User Path, Machine first. Variables are built in Windows' order: the Machine scope, then the User scope, each setting plain values (REG_SZ) before expanding `%NAME%` references in expandable ones (REG_EXPAND_SZ); a value saved as plain text never expands, which is how `[Environment]::SetEnvironmentVariable` can break a `%USERPROFILE%` Path. Each tab keeps PowerShell 7's location history, 20 folders each way, for `cd -` and `cd +`.
- **Events:** `cwdChanged`, `envChanged`, `folderChanged`, `sessionOpened/Closed/Activated` and `terminalsRestarted` share the workspace's event stream with git's. They carry variable names, never values. `folderChanged` announces every folder made (by `mkdir`, `New-Item` or a `mkdir` setup step, new parents first) or removed (by `Remove-Item`, after everything inside it); files keep git's `fileChanged`.
- **Shell profile** (`src/engine/shell/machine`): in a laptop sandbox the Shell runs PowerShell 7 in the active tab instead of Act 2's small command set. A line goes through three steps, each matching real PowerShell: the lexer (`lex.ts`: quotes, backtick escapes, `$variables`, `#` comments, operators), `args.ts` (parameters versus values, comma lists), and the binder (`bind.ts`: case-insensitive names, unambiguous prefixes, positions, and PowerShell's exact errors). Commands live in `registry.ts` with PowerShell's aliases (`cd`, `pwd`); an unknown name gets PowerShell's two-line "is not recognized" error, and parameters the sandbox lacks, like `-Include`, are refused rather than ignored. Commands so far:
  - `Get-Location`, and `Set-Location` (`cd -`, `cd +`, home with no path, a wildcard that picks one folder, and the `cd..` and `cd\` functions).
  - `Get-ChildItem` (`ls`, `dir`: wildcards, `-Recurse`, `-Depth`, `-Force`, `-Hidden`, `-ReadOnly`, `-File`, `-Directory`, `-Name`, `-LiteralPath`, and `Env:`).
  - `New-Item` and `mkdir`: a file needs its folder unless `-Force`; a folder brings its parents. A file on the way, or a character Windows forbids (`* ? < > | "`), is refused in PowerShell's words.
  - `Test-Path`: True when anything visible matches, wildcards included; it also checks `Env:NAME` without printing the value. A missing `-Path` prints PowerShell's non-interactive error rather than prompting for one.
  - `Remove-Item` (`rm`, `del`): wildcards, `Env:NAME`, and PowerShell's Confirm question for a folder with children, answered by the next line typed (Y, A, N, L). It deletes children first; without `-Force` a hidden or read-only item stays with PowerShell's access error. The folder this tab stands in, and home, are in use; another tab's folder isn't, as `Set-Location` doesn't move the pwsh process.
- **Listings** print PowerShell's tables byte for byte (`format.ts`). Every item shows the same LastWriteTime, 9/27/2026 10:15 AM, because the laptop keeps no clock, and a file's Length counts its line ends as `\r\n`, as Windows tools write them. Items can carry the Hidden attribute (AppData does; a leading dot hides nothing on Windows) and the ReadOnly one (a home's Desktop, Documents and Downloads show `d-r--`, as on a stock install). A `Name Value` row longer than 120 columns ends in an ellipsis, as PowerShell cuts it. One known difference: when a wildcard with `-Recurse` matches at several depths, PowerShell prints the deeper folders' tables first; the sandbox prints folders top down.
- **Driver** (`src/engine/shell/driver.ts`): how the in-game agent acts. `drive(shell, action)` takes one action (run a line, answer a Confirm question with Y, A, N or L, write a whole file, open a terminal tab, or switch tabs) and runs it through the same `Shell` the player uses, in the active tab, so the output is real. It returns the tab, the prompt before the action, what was typed, the output and exit code, whether a question is now open, and the events announced during that action alone. A line is refused while its tab is asking (PowerShell would read it as the answer), and an answer is refused while nothing asks. The file tool makes missing folders through the machine, so each is announced; a file or folder in the way fails the write with an error line instead of throwing.

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
  - `MENTOR_DAILY_CALL_CAP` (default 50; and/or a daily spend estimate cap)
  - `MENTOR_PORT` (optional, default 18787): the server listens on 127.0.0.1 only, and the Vite `/api` proxy follows it.
  - `MENTOR_BASE_URL` (optional): route through Kyle's LiteLLM gateway. Implement only after confirming LiteLLM exposes an Anthropic-compatible Messages endpoint; otherwise skip and note it in the PR.

### Modes (`POST /api/mentor` with `{ mode, context }`)
- **hint**: hint ladder. Level 1: a question back. Level 2: the concept. Level 3: the command with explanation. Never skips levels.
- **grade_question**: grades Kyle's free-text clarifying question against the ticket rubric. Returns JSON `{ score: 0-3, whyItMatters, betterVersion }`.
- **explain**: explains a mistake after a drill ends (never during). Not in M1: drills show the pass or miss, and misses go to the review queue.
- **interview** (M5, Act 8 and Experience Vault): uses the interview model. Asks follow-ups, pushes on weak answers, scores against a rubric.

### Rules
- System prompts live in `/server/prompts/*.md` so Kyle can read and tune them.
- Sage is unavailable during No-AI Drills and placement tests: the client never calls it, and the server rejects calls tagged with a drill session.
- **Cost guard**: usage tracked in a local JSON file (persists across restarts, gitignored), shown in Settings (M1; the HUD badge shows online or offline). Hard stop at the daily cap.
- **Offline behavior**: if the server is unreachable or has no key (always the case on the GitHub Pages build), Sage shows "offline", hints fall back to pre-written hint ladders in mission data, free-text grading is hidden, and multiple-choice Question Rounds still work. The game stays fully playable.

## 10. Content format

- Missions are typed data in `src/content/actN/*.ts`, never hardcoded in scenes.
- A schema (zod or equivalent) validates every mission in tests.
- **Mission object**: `id`, `act`, `title`, `briefing` (scene id + captions), `initialRepoState` (fixture), `steps` (instruction, success predicate, hint ladder), `drills` (scenario text, setup fixture, success predicate), `questionRound` (ticket, candidates with quality tag + rationale, rubric for free text), `xp`.
- **Directed steps** (`agentSchema.ts`): a step's `agent` task holds 2-3 start `plans` and 1-3 `fixes` (a card, Otto's script, his claim, a lesson), one `check` whose options are graded by `truth` predicates, `guards` that must stay true, and read-only `looks`. A mission's steps are all directed or all typed. A directed mission starts with `windows()` and sets `approvals` (`changes` or `destructive`). `validateAct` gives directed text tighter budgets: goal and hints 20 words, cards and Otto's lines 12, lessons and feedback 25, checklist labels 8. It also adds up the texts that share a screen (the Direct screen, a fix round, each Check screen, each predict).
- **Judgment drills** (`JudgmentDrillSchema` in `schema.ts`): a directed mission's drills have a `kind` (`predict`, `diagnose`, `fix` or `approve`), a `setup`, the `history` Otto already ran, an optional `claim`, and an `explain` shown after the answer. No option is marked right: each has an `outcome`, a `truth` or a `script` the engine checks, and an approve drill has `guards`. A typed mission's drills have no `kind` and keep their `success` predicate. `validateAct` keeps a drill's question (prompt, claim, Otto's line, options) to 60 words and its `explain` to 30.
- **Act object**: `act`, `title`, `missionIds`, `placementTest`, `boss`, `fieldMission`. With `earlyAccess: true`, it has 1-6 missions counting the `upcoming` titles, no placement test, and a boss and Field Mission only once they're built. Code reads a part through `requirePlacement`, `requireBoss` or `requireFieldMission`, which throw a `ContentError` when it isn't built yet.

## 11. Curriculum

### Act 1: The Machine (directed, in progress)
The principles every engineer who directs AI agents needs about the machine they run on, learned by getting the Quillwork API running on Kyle's laptop with Otto. Kyle directs; Otto's real PowerShell runs through the laptop engine and animates the machine island. It becomes the starting Act as soon as Mission 1.1 is playable, and ships in early access, one mission at a time.
- 1.1 **Where Things Live**: every command runs in a folder; bare names versus full paths; a fresh terminal starts at home
- 1.2 **Deletes Are Forever**: terminal deletes skip the Recycle Bin; read the scope before approving; make undo possible first
- 1.3 **Secrets Stay Home**: `.env` versus `.env.example`, `.gitignore`, and why you handle secrets yourself
- 1.4 **Every Terminal Is Its Own World**: a terminal copies variables and PATH when it opens; "not recognized" means not on *this* terminal's PATH
- 1.5 **Dependencies Are Declared**: `package.json`, `node_modules`, the lockfile, and reading every package name
- 1.6 **Running Isn't Working**: processes, PIDs and ports; stop exactly the one you mean; prove it works by asking the port

Boss: **"Works on My Machine"**: fix a teammate's laptop from symptoms, turning down Otto's bad ideas. Field Mission: **"Brief Your Real Agent"**: write the setup section your real coding agent reads first, on SandCastles. Full design: `docs/act1-directed.md`.

### Act 2: Git Core (M1)
Three areas, status, add, commit, log, diff, .gitignore, commit hygiene, undo.
- 2.1 **Three Rooms**: `init`, `status`, `add`, `commit` (Workbench / Loading Dock / Vault)
- 2.2 **Reading History**: `log`, `show`, `diff`, `diff --staged`
- 2.3 **Good Commits**: atomic commits, Conventional Commit messages, `commit -am` and when not to use it
- 2.4 **The Ignore List**: `.gitignore`, `rm --cached`, secrets hygiene
- 2.5 **Undo Everything**: `restore`, `revert`, `reset` modes, reflog recovery

Boss: **"The Dirty Tree"**: Dex deploys from a clean checkout in 3:00. The Workbench has ~40 modified and untracked files. Commit the right things in sensible commits, without committing `.env` or build output, before the timer hits zero. Twist at 1:00: Dex reports a missing file that was never tracked: a too-broad `.gitignore` rule (`log*`) has been hiding `src/logger.ts`, and the player must commit it before the clock runs out.

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
    engine/machine/    Act 1's simulated Windows laptop: drive, env vars, terminal tabs + tests
    engine/shell/      shell commands + parser + the agent's driver + tests
    engine/verify/     Field Mission output parsers + tests
    game/world/        three.js scenes (Campus, Git World), renderer boot, post; zones.ts lists each island as data
    game/missions/     mission runner, grading
    game/agent/        Otto's side (pure): his transcript, and the sandbox log that replays a sandbox exactly, for dry runs
    game/progression/  XP, ranks, review queue (SM-2), stats, mastery
    game/save/         IndexedDB, schema versions, migrations, export/import, autosave
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

- Dark, atmospheric night campus. Fog or depth falloff. Key + rim + low ambient lighting. Bloom on glowing crates, banners, and portals. Stars fill the whole sky around every island, below the horizon too.
- Glassmorphism UI panels (blurred translucent backgrounds, 1px subtle strokes, rounded corners).
- Terminal is readable: monospace, 14px+, high contrast. UI text never goes through post effects.
- **Zero console errors and zero warnings** in dev and production builds.
- Motion from the first frame. A static opening screen reads as broken.
- Target 60fps on an NVIDIA desktop GPU. Respect the reduced-motion setting.
- Dev status badge: backend (WebGPU / WebGL2), three.js revision, mentor state, save state.
- Controls: third-person camera with damped orbit, WASD + mouse, click-to-walk, Space to jump. Focus rules: typing in the terminal or editor never moves the avatar. Space jumps and Enter runs a suggested command only while the world has the keyboard; the suggestion chip never takes focus, and HUD buttons hand the keyboard back after a mouse click (keyboard users keep their focus).
- **Verify loop** after every UI-affecting change: run the app in Chrome, read the console for errors and warnings, take two screenshots a few seconds apart (they must differ), compare against this section.

## 15. Milestones

| Milestone | Scope |
|---|---|
| **M1** | Vertical slice. Scaffold, CI, Pages deploy, save system, Campus hub, Git World (three areas + commit path), git engine (M1 commands), shell, terminal, editor, mission runner, review queue, Sage server (hint + grade_question), Act 2 complete. |
| **M2** | Act 1, directed (early access first: Mission 1.1 as the starting Act, then a mission at a time), then Act 3. Branch/merge/rebase visuals. Code Review mini-game. Skill tree. |
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
