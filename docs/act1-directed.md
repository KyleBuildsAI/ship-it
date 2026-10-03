# Act 1 "The Machine", directed: final build spec

Status: final design, 2026-09-28. Nothing in the repo was changed to write it.
Every path below is relative to the repo root unless it is written in full. `DESIGN.md` and `CLAUDE.md` rules apply.

This spec starts from the winning design, **ship-a-thing**. It adds the best ideas the judges picked out of **permission** and **mental-models**, and it fixes every problem the judges raised. The earlier Act 1 plan, where Kyle typed exact PowerShell (`act1-spec.md`), is dropped. Its topics, laptop, districts and boss symptoms are reused wherever they still fit.

---

## 0. Where things stand (checked against the code today)

**Main and chain 1**
- `main` is at `d838532` (#117). #116 and #117 have both merged. #118 (`feat/powershell-binder`) is open.
- Eight chain-1 branches are left. `feat/powershell-binder`, `feat/binder-hints` and `feat/number-parameters` are already rebased onto main.
- `feat/location-cmdlets` through `feat/remove-item` still sit on the old base `636600d`, which was the pre-rebase number-parameters.

**Chain 2** (local and unpushed; the `origin/*` copies are stale)
- `feat/drive-move` `247d916` → `feat/copy-move-rename` `660f545` → `feat/content-cmdlets` `874e10c` → `feat/redirects` `0e20d44` → `feat/machine-queries` `0939145`.
- All are stacked on `feat/remove-item` `72eb323`.
- `0939145` only adds `src/engine/machine/queries.ts` and its test (111 lines). It needs nothing beyond main's `machine.ts` and `winPath.resolveExisting`.

**The stash.** `stash@{0}` in the `ship-it-next` worktree holds the draft machine predicates:
- `stash@{0}^3:src/game/missions/machinePredicates.ts`
- matching edits to `predicates.ts` and `schema.ts`

**Captures.** Real PowerShell captures already on main in `src/engine/shell/machine/fixtures/` include `get-command`, `tcp-listen`, `netstat-listen`, `npm-run-missing`, `version-node`, `version-npm`, `error-stop-process-*`, `error-tcp-missing`, `error-cd-missing` and `new-item-folder`.

**Why Act 1 isn't there today.** Four things block it, and PRs A3, A4, A23 and A27 fix them:
- `src/content/index.ts:7` lists only Act 2.
- `src/game/world/zones.ts` has `ZONE_FOR_ACT = { 2: 'gitworld' }`, so `campus.ts` draws Act 1's portal as locked.
- `src/game/worldState.ts:3` `ZoneId` has no machine zone.
- `ActSchema` (`schema.ts:508`) only accepts a finished Act: 3-6 missions, a placement test, a boss and a Field Mission.

The text and tutorial also still point at Act 2: `TitleCard.tsx` HINTS, and `tutorial.ts` has a step that types `pwd`.

**Facts the design relies on (checked)**
- `refreshAct` (`saveRules.ts`) can never complete an Act that has no boss.
- `runner.checkStep` (`runner.ts:104`) moves on through *every* following step that is already true.
- Creating or removing a folder emits no event (`items.ts`, `remove.ts` on `feat/remove-item`).
- `MachineShell.asking` and `confirm.ts`: after a question, the next `run()` is the answer, and that answer is not added to history.
- `TerminalPanel.tsx` has no try/catch around `shell().run`.
- The epic already exists as issue **#95**.

---

## Summary (one screen)

- **Otto** is Quillwork's in-game coding agent. He types; Kyle directs.
  - Each step, Kyle picks one of 2-3 request cards, or says it his own way.
  - Otto runs real PowerShell through the existing `MachineShell` and the 3D world animates.
  - Otto pauses before risky lines. The approval card shows the effects worked out by a dry run, and the world shows a ghost of them.
  - Otto then claims "Done: …". Kyle answers one specific question about the result. He can use read-only **look** chips to gather evidence first.
- **Everything is graded by the engine.**
  - A step passes when its predicates hold.
  - An option is right when its truth predicate holds.
  - Denying a line is right when a dry run of it breaks a guard.
  - A fix passes when running it reaches the goal.
  - Authored text never decides correctness.
- **Drills are judgment drills with no typing**: predict, diagnose, fix, order, approve and spot. Each has a timer, Sage is off and there are no hints. Misses go to the existing review queue by drill id.
- **Six missions, each named for its principle**:
  - Where Things Live
  - Deletes Are Forever
  - Secrets Stay Home
  - Every Terminal Is Its Own World
  - Dependencies Are Declared
  - Running Isn't Working
- **The boss** is "Works on My Machine", played from symptoms. **The Field Mission** is "Brief Your Real Agent" on SandCastles.
- **Act 1 ships in early access**, starting with Mission 1.1. It is the starting Act for a new save. Act 2 plays exactly as it does today.
- **Path to the first playable build:**
  1. merge chain 1: 8 reviewed branches, split into 14 PRs so each is about 400 lines or less
  2. 27 small new PRs (A1 to A27)
  3. A new save then opens Act 1, and Mission 1.1 plays offline with its world, drills and Question Round.

---

## Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Where does the agent's "intelligence" come from? | Authored content: plans, scripts, claims and slips are data. Sage only maps free text onto an authored plan. | Works with no key. Every path can be tested. |
| D2 | Where does Otto's output come from? | Every `run` goes through `Shell.run`, which is the per-tab `MachineShell`. A content test fails on any "doesn't run … yet" refusal. | Real PowerShell output and errors are what Kyle learns to read. |
| D3 | How are understanding checks graded? | Each check option has a `truth` predicate. The right answer is whichever one is true now. Tests prove every option is true on at least one reachable path. | Grades by state. Rules out made-up distractors. |
| D4 | How is a wrong approval detected? | `harmful` = a dry run (replay into a scratch sandbox) breaks a step guard or shows a secret. | No hand-written "right answer" flags that can go stale. |
| D5 | What explains a gate? | The effects list is worked out from the dry-run diff ("Deletes C:\…\api and 23 items inside"), never authored. Drills hide it, and hide the ghost. | Fixes the judges' "authored explain gives the answer away" problem. Scaffolding fades out in drills. |
| D6 | Which lines pause for approval? | Worked out from the diff under the mission's `approvals` mode (`effects.ts`). **`destructive`**: deletes, replaced files, moves, saved env changes, stopped processes, or `ask`. **`changes`**: also every create, copy or append. Moving folders, session variables and opening terminals never pause. | Mirrors real agent permission modes. 1.1 uses `destructive` to avoid approval fatigue; 1.3 uses `changes` so every file edit shows a diff. |
| D7 | What about PowerShell's Confirm question? | Otto answers it himself, visibly in the terminal. The answer is a gate, and its effects come from a dry run of Otto's intended letter. | The lesson is that agents answer safety prompts for you. |
| D8 | Can Kyle undo? | **Fix** is the main path: Kyle directs Otto to clean up. **Rewind** is always offered as a secondary button, and first when a guard broke. It costs the Plan star. Its line: "A real laptop has no rewind." | Practises cleaning up after an agent, and stays honest. |
| D9 | Types of drill | `Drill = SandboxDrill` (today's, no `kind`) `\| JudgmentDrill` (`kind`: predict, diagnose, fix, order, approve, spot). `submitAnsweredDrill` sits beside an unchanged `submitDrill`. | Act 2's content and runner behave the same as today. |
| D10 | How does Act 1 ship before it's finished? | `ActSchema.earlyAccess`. The placement test, boss and Field Mission are optional until it flips. `recommendedAct` skips Acts with no work left. | Mission 1.1 ships alone. The Acts button doesn't keep landing on a finished early Act. |
| D11 | Does starting a mission move Kyle? | Only missions whose setup is a laptop (Act 1) ask to travel to the machine island. **Act 2 never auto-travels.** | Act 2 stays as it is. |
| D12 | What does the terminal do in Act 1? | It shows Otto's commands and output and is read-only during Act 1 missions and drills. Free play on the island can still be typed in. | Typing is never required. |
| D13 | How big does the engine grow? | Only the forms authored lines use (checked by `agent.test.ts`): no winget, `[Environment]::`, pipes, member access or tab completion. | The content is the spec for the engine. |
| D14 | What is the agent called? | **Otto**, shown in magenta (`#d69cff`, the terminal's magenta). "Patch" clashed with the Patch Panel and with git patches. "Quill" clashed with Quillwork. Game notices stay cyan. | Clear names. |
| D15 | Rewards | Three stars per step (Plan, Safety, Check), 2 XP each, paid the first time only through `completeMission`. The best stars are saved in save v3 (B5). The slice needs no save change. | A reason to replay. Clear feedback on the three skills. |
| D16 | What does Act 1 mount for git? | `Users/kyle/quillwork/api`: the API is the repo, so Act 2's `ignored` and `tracked` predicates work in 1.3. | Reuses grading that is already tested. |

---

## 1. The core mission loop

### 1.1 Roles

| Who | Job in Act 1 |
|---|---|
| **Kyle** | Directs (picks or writes a request), approves or denies risky lines, answers Otto's questions, checks Otto's claims, directs fixes |
| **Otto** (NEW) | Quillwork's coding agent on Kyle's laptop. Runs everything. Fast, literal, confident and sometimes wrong. |
| **Sage** | Mentor. Gives hints and, when a key exists, reads free text. Always silent in drills. |
| **Marco** | Hands out vague tickets in the Question Round (unchanged) |
| **Dex** | Runs the clock in the boss (unchanged) |

The mission phases stay `briefing → sim → drills → question → done` (`runner.ts:20`). In directed missions, the **sim** is the step loop below.

The story line, from Marco in the first briefing: *"The Quillwork API must run on your laptop by Friday. Otto, our coding agent, types. You direct and check."*

### 1.2 Otto: look, voice, where his work appears

**Look.** A small hovering drone with a rectangular screen face, glowing magenta.
- `›_` on the screen means typing.
- An amber pulse means waiting for Kyle.
- A red flash means a line failed.
- He recoils when denied.
- He hovers over the tile of his active terminal's folder, and flies to whatever a command touches.

**Voice.** 12 words or fewer per line.
- Upbeat and literal. He reports "Done: …".
- He reports what he *meant* to do without checking what happened. That is the real agent failure mode, not cartoon villainy.
- When caught, he answers plainly with the evidence: "You're right. The Directory line says C:\Users\kyle."
- When denied on a harmful line: "Good stop. That was the whole project."
- His first line says he is scripted: "I'm Otto. Scripted for this course, so my slips teach."

**Where his work appears**
1. **Terminal (xterm).** The active tab's real prompt, then the line typed out at about 40 characters per second, then the real output in today's tones.
   - A magenta `otto ›` marker starts each line he types (Kyle's looks have none). A denied line ends with a dim `(denied)`.
   - A tab switch prints `── PS 2 ──`.
   - A small read-only tab strip above the terminal shows `PS 1 · PS 2`, the active tab lit.
2. **Panel.** Otto's lines in a speech bubble, and a compact run log (one row per line, with its exit status).
3. **World.** The drone and a lantern per terminal (§4).

Speed (`game/agent/pace.ts`):
- About 40 characters a second, with a 0.4 s pause before each line and 0.6 s after each result, so the output can be read and the world can move. Kyle's look lines appear at once.
- Instant under reduced motion and under `navigator.webdriver`. Reduced motion is the game's setting, which follows the system's preference while it's set to "system", as the world does.
- 2× and Instant are available in Settings (B5). A drill's scene plays at 3× (§2.2).

**Slips.** Every slip is one real agent mistake from a fixed list, named the same way everywhere. Each plan carries at most one `slip`, and the Result screen names it ("Slip: wrong place").

| Slip | Missions |
|---|---|
| `wrong-place`: ran where its terminal happened to stand | 1.1, 1.5 |
| `overclaim`: "done" after an error, or without checking | 1.1, 1.6 |
| `too-broad`: a wildcard, `-Recurse`, the parent folder, answering A | 1.2 |
| `wrong-verb`: replace instead of append, move instead of copy | 1.2 |
| `leak`: printed or copied a secret, or asked for one in chat | 1.3 |
| `stale-terminal`: trusted a terminal older than a save or install | 1.4 |
| `shell-mixup`: bash syntax in PowerShell | 1.4 drills |
| `big-hammer`: reinstall everything, kill every node | 1.4, 1.6, boss |
| `invented-fact`: a lookalike or made-up package | 1.5 |
| `moved-goalposts`: changed the goal (another port) instead of fixing it | 1.6 |

### 1.3 One step, screen by screen

Layout, unchanged in frame:
- The left glass panel (`PlayPanel` → `MissionView` → new `AgentStepView`) holds the step.
- The terminal stays at the bottom.
- The world is in the middle.
- Every choice is a `<button>`. Otto's lines go to an `aria-live="polite"` region.

| Stage | Kyle sees | Kyle does | Word budget (checked by `validateAct`) |
|---|---|---|---|
| **1. Direct** | "1.1 Where Things Live · Step 2 of 4". The goal, and the step's `note` if it has one. Otto: "Your call." 2-3 request cards. A secondary **Say it your way** button. Hint. | Clicks a card. Or writes a sentence: Otto repeats it back as "Plan: *card text*. Go?" [Go] [Pick instead]. | goal ≤ 20; each card ≤ 12; note + goal + all cards ≤ 60 |
| **2. Run** | Otto's bubble. The terminal types each line. The world animates. **Stop** (between lines). | Watches and reads. Stop returns to Direct with the plan marked as tried. | Otto lines ≤ 12 |
| · **Predict** (only lines with `predict`) | The line sits at the prompt, not yet run. "Before Otto runs it: where will notes land?" 2-4 options. | Picks. Then a ghost shows what will happen for 1.5 s and the line runs. The prediction is graded after it runs. | question + options ≤ 40 |
| · **Gate** (lines that pause, D6) | "Otto wants to run:" the command, Otto's `say`, the **worked-out effects** (up to 3 lines), a diff for `write`, and the blast radius in the world. [Allow] [Deny]. For Confirm: PowerShell's question and "Otto will answer A". | Allow or deny. Deny runs `onDeny` (Otto corrects himself), or stops for new directions. Denying a safe line makes Otto ask "I need this to finish: <effect>. Run it?" | say ≤ 12 |
| **3. Check** | Otto's claim ("Done: notes is in the API project."). One question with 2-4 options. Up to 3 **look** chips ("Where is Otto?"). The terminal and world stay live. | Runs looks (read-only, printed in the terminal), reads the evidence, picks an option. | claim + question + options + look labels ≤ 60 |
| **4. Result** | Verdict banner. The checklist (`explain(all(success, guards))`, hidden until now). The chosen card's **anatomy chips** (goal · place · limits · check, the covered ones lit). The slip name. One line of text: the option's `feedback` on a miss or false alarm, otherwise the plan's `lesson`. Stars. | [Next step], or [Direct a fix] and [Rewind step] | feedback and lesson ≤ 25; checklist labels ≤ 8 each |

A **fix round** looks like Direct:
- Otto says "Stopped. What should I do instead?" or "Missed that. How should I fix it?"
- The cards are the step's `fixes` plus the start plans not yet tried.
- Otto's line + cards ≤ 60 words.

### 1.4 How a step is graded

1. **State.** The step passes when `all(step.success, ...agent.guards)` holds on the live sandbox. It is checked only at Check.
   - `missionSandboxChanged` returns early for directed steps, so Otto's intermediate lines never advance anything.
   - The step completes through the new `completeAgentStep` (agentRunner.ts), which advances **exactly one** step. `runner.checkStep` would skip ahead through later steps that are already true, and skip their directing.
   - Step XP is still saved by `recordSteps`.
2. **The check.** The chosen option's `truth` is evaluated after the script.

   | Chosen option true? | Step passed? | Verdict | What happens |
   |---|---|---|---|
   | yes | yes | **Confirmed** | Step completes |
   | yes | no | **Good catch** | Fix round opens |
   | no | yes | **False alarm** | Step completes. The option's feedback shows what Kyle misread. |
   | no | no | **Missed** | The true option and the red checklist rows are shown. Fix round opens. |

3. **Gates.** `harmful` comes from the dry run (D4). Deny is right exactly when the line is harmful.
   - Allowing a harmful line runs it for real. The guard breaks and Rewind is offered first.
   - Denying a safe line only costs time and the Safety star.
4. **Predicts.** Right when the picked option's `outcome` holds after the line runs. If the line was later denied, it is judged on the dry-run fork.
5. **Stars (0-3 per step).**
   - **Plan**: the first plan chosen passed with no fix and no rewind, and hint rung 3 was never shown.
   - **Safety**: every gate and Confirm decision was right (given free if there were none).
   - **Check**: every verdict was Confirmed or Good catch, and every predict was right.
6. **XP.**
   - Step XP as today.
   - `directingXp` = 2 × stars, paid on the first completion through `completeMission(…, { drillPercent, questionXp, directingXp })`. Act 2 passes 0.
   - No save change in Milestone A.
7. **Done screen.** "You caught 2 of 3 of Otto's slips", stars per step, the Question Round rationales as today.

### 1.5 Look chips

- `agent.looks` holds up to 3 labelled read-only lines, for example "Where is Otto?" `Get-Location`.
- They run through the driver in the active tab and print to the terminal.
- `agent.test.ts` proves each look emits no events, leaves the machine snapshot unchanged, and prints no secret.
- In free play and the Check stage, clicking a world tile offers "List this folder" as a look (B13).
- Drills never have looks.

### 1.6 Hints

- The 3-rung ladder is unchanged (`StepSchema.hints`, `requestHint`, only in `sim`, never skipping a rung):
  1. a question back
  2. the principle
  3. which card to pick, or which evidence to read
- Rung 3 also highlights `agent.hintPlan`, which must be a strong start plan.
- Showing rung 3 costs the Plan star.
- In directed steps each rung is ≤ 20 words, so it fits beside the goal.

### 1.7 Offline vs Sage

| Feature | Offline (no key, and the Pages build) | Added when Sage is online (key set, under the cap, not in a drill) |
|---|---|---|
| Directing | Cards. **Say it your way** uses `anatomyOf(text)` and `matchPlan(text, plans)` (§5.8). Vague text lands on the weak plan, so Otto makes that plan's mistake. Always repeated back for Kyle to confirm. | New mode **`interpret_plan`**: `{ planId \| null, missing: AnatomyPart[], question \| null }`. The server rejects any `planId` not in the step. Sage never writes commands. |
| Anatomy after the step | Chips from the card's `covers`, or from `anatomyOf` on Kyle's own words | Sage's `missing` list, shown as one line ≤ 25 words |
| Hints | The written ladder | The existing `hint` mode, plus an optional `agent` context: Otto's last 20 lines (values redacted), each tab's folder, env **names**. `gitStatus` is `''` for laptop sandboxes. |
| After a Missed check or a missed drill | Option feedback and the plan's lesson | Mode **`explain`** (already in DESIGN §9): 1-3 sentences, after the drill ends, never during |
| Question Round | Multiple choice | The existing `grade_question` |
| Drills, placement, reviews, boss | Fully playable | Nothing (the `drillGuard` blocks every call) |

---

## 2. Judgment drills (predict and diagnose)

These keep today's drill rules:
- No typing, no hints, mentor off (`beginDrill` guard).
- Scored with `scoreDrill(passed, seconds, limit)`. A timeout is a miss.
- `recordDrill` and `addMiss` on a miss. Reviews use `recordReview` and SM-2 (`qualityFor` only needs `timeLimitSeconds`).
- Saved by id, so **no save change**.

### 2.1 Formats

| `kind` | On screen | The key is worked out by | Default limit | Ships in |
|---|---|---|---|---|
| `predict` | "Otto is about to run this. What happens?" The action is shown as code. | Run the action for real, then evaluate each option's `outcome` (`result` ok or error, `printed` text, `state` predicate). Tests prove exactly one is true. | 40 s | A7 |
| `diagnose` | "Why did this break?" or "Otto says X. Is he right?" (optional `claim`) | Each option's `truth` on the scene's end state. An option with no truth is false. Tests prove exactly one is true. | 40 s | A7 |
| `fix` | "Which fix is right?" | Run the picked option's script. It passes when `goal` holds and no `failIf` does. Several options may pass; tests prove at least one passes and at least one fails. | 50 s | A7 |
| `approve` | "Otto wants to run this. Allow?" Only the command and Otto's `say`: **no effects list, no ghost**. | A dry run. Deny is right exactly when a guard breaks, or (from C1) a secret shows. | 35 s | A7 |
| `order` | "Put Otto's steps in order." Kyle clicks the cards in sequence. | Run the cards in Kyle's order, then evaluate `goal`. Tests: the listed order passes, the reverse fails, and at least a third of all orders fail. | 60 s | B11 |
| `spot` | "Which line in Otto's plan is wrong?" (3-5 lines) | Run the plan with the picked line swapped for its `fix`. Tests prove exactly one pick passes and the original plan fails. | 45 s | B11 |

### 2.2 How a drill plays

1. `loadSandbox(drill.setup)`. The world shows the laptop. The drill's `history` (lines Otto already ran) plays through the driver into the terminal at 3× speed (instantly under reduced motion). The world animates each line.
2. The question card appears. **The clock starts only now**: `startDrill(…, nowMs)` is called once the scene ends.
3. Kyle answers, or time runs out.
4. **Reveal.**
   - predict, fix, order and spot run on the live sandbox, so the world animates what really happens.
   - An allowed `approve` runs for real. A denied one shows the ghost it would have caused.
   - A Right or Missed banner, then the drill's `explain` (≤ 30 words).
5. Options are shuffled by `shuffleFor(drillId, attempt)`, where `attempt` is the number of `drillHistory` entries for that id. Reviews can't be passed by remembering positions.

### 2.3 Review queue and placement

- Reviews mix every Act's drills by id, as today. `StandupBoard` shows `findDrill(id).prompt`, which both drill types have.
- **Placement test** (added when Act 1 leaves early access, G6):
  - 12 judgment drills, 2 per mission.
  - 85% tests out (`PLACEMENT_PASS_PERCENT`).
  - Pitch: "Already direct agents on Windows? 85% tests out of Act 1."
  - Drills: `wtl-predict-fresh-terminal`, `wtl-approve-real-notes`, `daf-approve-wildcard`, `daf-predict-confirm`, `ssh-approve-cat-env`, `ssh-predict-ignore-after-commit`, `etw-diagnose-stale-tab`, `etw-approve-setx-path`, `dep-approve-lookalike`, `dep-fix-no-module`, `riw-approve-name-node`, `riw-diagnose-econnrefused`.

---

## 3. The Act 1 curriculum

### 3.0 The shared laptop: `src/content/act1/shared.ts` (NEW)

```ts
export const HOME = 'Users/kyle';
export const QW = 'Users/kyle/quillwork';
export const API = 'Users/kyle/quillwork/api';   // Act 1's git mount (D16)
export const WEB = 'Users/kyle/quillwork/web';
export const DOCS_KEYS = 'Users/kyle/Documents/keys';
/**
 * Windows 11, PowerShell 7.6, one terminal open at home. The API is a real repo, committed once.
 * windows() write paths are drive paths; init/stage act on the mount with project paths.
 */
export function laptop(): FixtureBuilder;
// windows({ user: 'kyle', computer: 'QUILL-LT-7', mount: API })
//   .files({ [`${API}/package.json`]: …, [`${API}/server.js`]: …, [`${API}/src/routes/notes.js`]: …,
//            [`${API}/.env.example`]: 'PORT=\nDATABASE_URL=\nQUILL_API_KEY=\n', [`${API}/docs/setup.md`]: …,
//            [`${WEB}/package.json`]: …, [`${WEB}/index.html`]: … })
//   .init().stage('package.json', 'server.js', 'src/routes/notes.js', '.env.example', 'docs/setup.md')
//   .commit('chore: initial api')        // commit() with no files: stages [] then commits the index
```

- All values are obviously fake (`dev-key-for-the-game`), so gitleaks stays green.
- Every mission has `act: 1`, `xp: 100`, `DEFAULT_STEP_XP` per step, and `approvals` set.
- Drill id prefixes are per mission (`wtl-`, `daf-`, `ssh-`, `etw-`, `dep-`, `riw-`), so `validateCatalog` stays clean.

---

### Mission 1.1: Where Things Live (`where-things-live`), approvals `destructive`. **The thin slice.**

**Principle.** Every command runs in a folder, and a terminal stands in one. A bare name starts there; a full path works from anywhere. A fresh terminal starts at home. Otto says "done" fast, so check where things landed.

**Visual.**
- Folder Terraces, with a lantern per terminal standing on its folder tile.
- A relative path lights a route from the lantern; an absolute path lights one from the `C:\` pad.
- A predict answer shows the ghost tile before the line runs.

**Engine.** Chain 1 only (`Set-Location`, `Get-Location`, `Get-ChildItem`, `mkdir`, `New-Item`, `Remove-Item`).

**Briefing** (`diagram: 'folder-terraces'`):
1. "The Quillwork API must run on your laptop by Friday. Otto, our coding agent, types. You direct and check."
2. "Every terminal stands in one folder. The prompt shows it: PS C:\Users\kyle> is your home folder."
3. "A bare name like notes starts there. A full path like C:\Users\kyle\quillwork\api works from anywhere."

---

**Step 1, `stand-in-the-api`.** Goal: "The API lives under your home folder. Get Otto's terminal standing in its folder."

Start plans:

| id | Quality · covers | Card | Otto runs | Result |
|---|---|---|---|---|
| `guess` | weak · goal | "Go to the api folder." | `cd api` (fails: `Set-Location: Cannot find path 'C:\Users\kyle\api' because it does not exist.`) | **Slip: overclaim.** Claims "Done: I'm in the API folder." |
| `step-by-step` | okay · goal, place | "Go into quillwork, then into api." | `cd quillwork`, `cd api` | Works only because Otto started at home |
| `full-path` | strong · goal, place, check | "Go to C:\Users\kyle\quillwork\api, then show where you are." | `cd C:\Users\kyle\quillwork\api`, `Get-Location` | Passes |

- Fix: `fix-full-path` "You're still at home. Go to C:\Users\kyle\quillwork\api."
- Check: "Where is Otto's terminal standing now?"
  - "C:\Users\kyle\quillwork\api" → `currentDirectory API`
  - "Still C:\Users\kyle: the cd failed" → `currentDirectory HOME`
- Looks: "Where is Otto?" `Get-Location`; "List home" `Get-ChildItem C:\Users\kyle`.
- Success: `currentDirectory API`.

---

**Step 2, `notes-in-the-api`.**
- `before: [restartTerminals]`, note: "Your laptop restarted overnight. Otto's terminal opened fresh, at home." This gives a real reason for the fresh terminal and fixes the judges' "arbitrary new terminal" complaint.
- Goal: "Have Otto make a notes folder inside the API project for your onboarding notes." (Full data in §5.9.)

| id | Quality · covers | Card | Otto runs | Result |
|---|---|---|---|---|
| `bare-name` | weak · goal | "Make a notes folder for the API." | `mkdir notes`, with a **predict**: "Where will notes land?" | Lands in `C:\Users\kyle\notes`. **Slip: wrong place.** |
| `full-path` | strong · goal, place | "Make C:\Users\kyle\quillwork\api\notes." | the full-path `mkdir` | Passes |
| `go-then-make` | strong · goal, place, check | "Go to the API folder, make notes there, then list it." | `cd`, `mkdir notes`, `Get-ChildItem` | Passes |

- Fixes:
  - `tidy-and-redo` (strong): `Remove-Item C:\Users\kyle\notes` (pauses: a delete; safe), then the full-path `mkdir`.
  - `just-redo` (okay): only the full-path `mkdir`, which leaves the stray folder.
- Check "Where did notes land?":
  - Only in the API
  - In C:\Users\kyle, where fresh terminals start
  - In both places

  Each option is reachable by some path.
- Guards: `driveFolder HOME/notes exists:false` "No stray notes folder at home"; `driveFile API/package.json` "The API is intact".
- Success: `driveFolder API/notes`. The evidence is the real `Directory: C:\Users\kyle` line above the mkdir table.

---

**Step 3, `web-notes`.**
- `before: [cd API]`, note: "Otto is back in the API folder."
- Goal: "The web app sits next to the API. Have Otto give it a notes folder too."

| id | Quality · covers | Card | Otto runs | Result |
|---|---|---|---|---|
| `by-name` | weak · goal | "Make web\notes." | `mkdir web\notes` | Creates `api\web\notes`. **Slip: wrong place.** |
| `one-up` | strong · goal, place, check | "Make ..\web\notes, one folder up, then list ..\web." | `mkdir ..\web\notes`, `Get-ChildItem ..\web` | Passes |
| `full` | strong · goal, place | "Make C:\Users\kyle\quillwork\web\notes." | the full-path `mkdir` | Passes |

- Fix: `tidy-web` runs `Remove-Item web -Recurse` (pauses: deletes `api\web` and 1 item inside; safe), then `mkdir ..\web\notes`.
- Check "Where is web's notes folder?":
  - Next door, `quillwork\web\notes`
  - Inside the API, `api\web\notes`
- Guards: `driveFolder API/web exists:false` "No stray web folder inside the API"; the API is intact.
- Success: `driveFolder WEB/notes`.

---

**Step 4, `two-terminals`.**
- `before: [cd API]`.
- Goal: "Open a second terminal for the web app, in quillwork\web. Otto's first terminal stays in the API."

| id | Quality · covers | Card | Otto runs | Result |
|---|---|---|---|---|
| `open-one` | weak · goal | "Open a terminal for the web app." | `newTerminal` | Claims "Done: terminal 2 is in web." **Slip: overclaim.** |
| `move-here` | weak · goal, place | "Go to C:\Users\kyle\quillwork\web." | moves terminal 1 | **Slip: wrong place.** |
| `open-and-go` | strong · all four | "Open terminal 2 in C:\Users\kyle\quillwork\web. Keep terminal 1 here." | `newTerminal`, `cd …\web`, `Get-Location` | Passes |

- Fixes:
  - `go-in-tab-2`: `useTerminal 2`, then `cd …\web`
  - `back-and-open`: `cd …\api`, `newTerminal`, `cd …\web`
- Check "Where do Otto's terminals stand?":
  - PS 1 in api, PS 2 in web
  - PS 1 in api, PS 2 at home
  - PS 1 moved to web
- Guard: `currentDirectory API tab:1` "Otto's first terminal stays in the API".
- Success: `currentDirectory WEB tab:'any'`.

---

**Drills (8)**

| id | Kind | Scene → question | Key worked out by |
|---|---|---|---|
| `wtl-predict-typo-cd` | predict | At home, Otto runs `cd quilwork\api` | `{ result: 'error', state: currentDirectory HOME }` |
| `wtl-predict-fresh-terminal` | predict | history: `newTerminal`; action `mkdir logs` | `driveFolder HOME/logs` |
| `wtl-predict-dotdot` | predict | In `API/src/routes`, `cd ..\..` | `currentDirectory API` |
| `wtl-diagnose-no-package` | diagnose | history: `newTerminal`, `Get-ChildItem package.json` (fails). "Why?" | `all[currentDirectory HOME, driveFile API/package.json]` |
| `wtl-diagnose-claim-todo` | diagnose + claim | history: `newTerminal`, `New-Item todo.md`. Otto: "todo.md is in the API." | `driveFile HOME/todo.md` |
| `wtl-fix-web-notes` | fix | In API, goal `driveFolder WEB/notes`, failIf `driveFolder API/web` | `mkdir ..\web\notes` ✓; full path ✓; `mkdir web\notes` ✗; `cd web` then `mkdir notes` ✗ |
| `wtl-approve-stray` | approve | `Remove-Item C:\Users\kyle\notes` (empty); guards: `API/notes` and `API/package.json` exist | Allow |
| `wtl-approve-real-notes` | approve | In API, `Remove-Item notes -Recurse`; guard `driveFile API/notes/onboarding.md` | Deny |

**Question Round.** Marco, "Grab the demo build": *"Can you get Otto to put the demo build where the team runs things? Should be quick!"*

| Quality | Candidates |
|---|---|
| strong | exact path of the build now; exact destination folder and machine |
| okay | which build; replace if one exists; who else runs from there |
| weak | drag it in Explorer; why a demo; how long |

Rubric: *pins an exact absolute path for the source or destination, or the machine.*

---

### Mission 1.2: Deletes Are Forever (`deletes-are-forever`), approvals `destructive`

**Principle.** A terminal delete skips the Recycle Bin. Read the scope before approving: which folder, which wildcard, `-Recurse`, and what PowerShell's question says. Make undo possible before a risky edit.

**Visual.**
- The blast radius: everything a pending line removes glows red; creates are green ghosts.
- A Recycle Bin prop stays empty ("Terminal deletes skip me").
- A removed item dissolves in red. An overwritten card flips blank. A backup glows blue.

**Engine.** Chain 2, plus the `write` tool (B12).

| Step | Goal | Plans and Otto's slip | Success / guards |
|---|---|---|---|
| `clear-tmp` | "The API's tmp folder is full of junk. Have Otto clear it out." | **okay** "Delete everything inside tmp." Otto runs `Remove-Item .\* -Recurse` (**too broad**, he dropped `tmp\`). It pauses with "Deletes 9 items in C:\…\api"; harmful. `onDeny`: `Remove-Item .\tmp\* -Recurse`; `denyLine` "Good stop. That was the whole project." **strong** "Delete C:\…\api\tmp with everything in it, then make an empty tmp." **weak** "Clean up the junk." runs `Remove-Item * -Recurse -Force`. | success: the tmp files are gone. Guards: `API/src`, `API/package.json`. |
| `the-confirm-question` | "Have Otto delete the old logs." | **okay** "Delete the logs folder." Otto runs `Remove-Item logs`, and PowerShell asks its real Confirm question. **Otto answers A himself**, and that answer pauses: "Deletes C:\…\logs and 4 items inside" (incident-2026-09.md among them). Denying sends `L`. **strong** "Delete only logs\*.log, then list logs." | success: three `.log` files gone. Guard: `logs/incident-2026-09.md` "Marco's incident report survived". |
| `backup-first` | "Otto will change config.json to port 3000. Make sure you can undo it." | **weak** `just-edit`: a `write` whose new content drops `timeout` and `retries` (**wrong verb**; the card's diff shows the red lines). **strong** `backup-then-edit`: `Copy-Item config.json config.backup.json`, then the same lossy write. The good plan contains the slip too, but it becomes recoverable. Fix `restore-from-backup`. | success: `config.json` contains port 3000, `timeout` and `retries` |

**Drills.**
- `daf-approve-wildcard`: deny `Remove-Item * -Recurse` in the API
- `daf-approve-dist`: allow `Remove-Item dist -Recurse` in web
- `daf-predict-confirm`: `Remove-Item logs` without `-Recurse` → `printed: 'Confirm'`
- `daf-predict-hidden`: the real `error-rm-hidden` capture
- `daf-diagnose-moved`: README moved into docs
- `daf-fix-restore`
- `daf-approve-diff`: a write that drops `"retries"`, deny
- `daf-order-backup`: copy, edit, read

**Question Round.** "Clean up the shared folder": *"Have Otto delete the old stuff before the audit, you know what I mean."*
- strong: define "old"; is there a backup, or archive instead
- okay: exact path; audit date; who else uses it
- weak: use Explorer; who made the mess; delete everything

---

### Mission 1.3: Secrets Stay Home (`secrets-stay-home`), approvals `changes`

Every file edit shows a diff. The briefing notes that real agents have the same switch.

**Principle.**
- Code and templates are shared; secrets are not.
- Values live in `.env`, which git ignores. `.env.example` lists names only.
- Anything Otto reads or prints enters his conversation with his model, so secrets are the one thing you handle yourself.

**Visual.**
- **The Fence** around the API tile: files git would share stand inside it, ignored files outside with a padlock.
- **Otto's memory cloud** above the island: a printed secret streams red sparks from his lantern into the cloud, and they never leave ("1 secret in Otto's context").
- Secret-shaped values show as `••••`.

**Engine.**
- Chain 2 (`Copy-Item`, `Get-Content`).
- C1: the `dotenv` and `secretShown` predicates, the `human` and `paste` actions, and Otto's `ask`.
- No env-assignment engine work, so this mission ships before 1.4.

| Step | Goal | Plans and slip | Success |
|---|---|---|---|
| `make-the-env` | "The API needs a .env with PORT=3000. Have Otto set it up from the template." | **strong** Copy the template, then a `write` that fills `.env` (diff; safe). **weak** a `write` to `.env.example` with `PORT=3000` (diff; **harmful**, guard `dotenv .env.example values:'empty'`). | `all[dotenv API/.env names[PORT] values:'filled', dotenv API/.env.example values:'empty']` |
| `keep-it-out-of-git` | "Make sure git never shares .env." The fixture's `.gitignore` lists `.env.local` but not `.env`. | **weak** `trust`: `Get-Content .gitignore`; Otto misreads it (**overclaim**). **strong** an append `write` of `.env` (diff `+.env`). Check "Will git share .env?". | `ignored ['.env']` (Act 2's predicate on the mount). The card walks out of the fence. |
| `the-api-key` | "Sage left the dev key in Documents\keys\quill-dev.txt. Wire it into the API without leaking it." | **weak** `otto-reads-it`: `Get-Content ~\Documents\keys\quill-dev.txt` (`ask` gate; harmful: `secrets` names the file), then a `write` of the key into README "for the team" (**leak**). **okay** `otto-asks`: Otto **asks** "Paste the key here and I'll add it?" Options: paste it (`paste` → the key is in the transcript: harmful), or "It's in Documents\keys. I'll put it in .env myself." (`human`). **strong** `you-paste`: a `human` action "Paste the key into .env yourself", then Otto runs `Get-Content .env.example` (names only). Claim: "Done: .env has QUILL_API_KEY. I never saw its value." | `all[dotenv .env names[QUILL_API_KEY] filled, dotenv .env.example values:'empty', not driveFile README contains 'dev-key', not secretShown DOCS_KEYS/quill-dev.txt]`. If the key was shown, the Rewind line is: "On a real machine: revoke the key and get a new one." |

**Drills.**
- `ssh-approve-cat-env`: deny
- `ssh-approve-cat-example`: allow
- `ssh-predict-ignore-after-commit`: `tracked ['.env']` stays true, because ignoring doesn't untrack
- `ssh-diagnose-env-at-home`
- `ssh-fix-key-in-template`
- `ssh-diagnose-claim-readme`
- `ssh-order-env`

**Question Round.** "Add the AI key to the demo server": *"Have Otto put the new AI key in so the demo works for everyone. Sage has it."*
- strong: where it should live; server or each laptop
- okay: the variable name; is a restart OK; rotate the old key
- weak: paste it in chat; commit it; which model

---

### Mission 1.4: Every Terminal Is Its Own World (`every-terminal`), approvals `destructive`

**Principle.**
- A terminal copies the saved variables and PATH when it opens. Later saves and installs reach only new terminals, **Otto's too**: after an install, the agent needs a fresh terminal.
- "Not recognized" means "not on *this* terminal's PATH".

**Visual.**
- Lanterns carry sticky notes (session variables) and a row of numbered PATH lamps.
- The **Corkboard** holds the saved notes; a new lantern gets them flown in.
- A stale lantern shows ghost lamps for folders it lacks.
- A lookup is a scout drone walking the lamps in order.

**Setup.**
- PS 1 opened "yesterday", before `program('Program Files/nodejs/node.exe', 'node', '24.15.0')` and `pathAdd('machine', 'C:\\Program Files\\nodejs', 'end')`.
- `C:\tools\node16\node.exe` (v16.20.2) is on the **user** Path.

**Engine.** D1 (`$env:` statements), D2 (`setx`), D3 (lookup, `Get-Command`, versions, the `program` op).

| Step | Plans and slip | Success |
|---|---|---|
| `npm-not-recognized` | Every plan starts with `npm --version`, which fails with the captured 2-line error. **weak** `fix-path-for-good`: `setx PATH "$env:Path;C:\Program Files\nodejs"` (pauses: a saved env change; harmful, guard `not envVar Path scope:'user' contains 'System32'`, because it copies the Machine Path into the User Path). **strong** `new-terminal`: `newTerminal`, then `npm --version`. **okay** `this-terminal`: `$env:Path += ';C:\Program Files\nodejs'`. Check "Which terminals can find npm now?" | `commandResolves npm` (active) |
| `saved-for-new-terminals` | **weak** `$env:QUILL_ENV = 'dev'`, `newTerminal`, `$env:QUILL_ENV` prints an empty line, and Otto claims done (**stale-terminal**). **strong** `setx QUILL_ENV dev` (the real `SUCCESS: Specified value was saved.`). Otto honestly adds: "This terminal can't see it; new ones will." | `envVar QUILL_ENV scope:'user' equals 'dev'` |
| `which-node` | Every plan starts with `node --version` → `v16.20.2`. **Slip**: "Done: Node 24 is ready." **strong** `Get-Command node`, then prepend `$env:Path = "C:\Program Files\nodejs;$env:Path"`. **strong** `newTerminal`. | `commandResolves node version:'24'` |

**Drills.**
- `etw-predict-setx-here`
- `etw-predict-new-tab`
- `etw-diagnose-stale-tab`
- `etw-diagnose-node16`
- `etw-diagnose-export` (a bash `export`, **shell-mixup**)
- `etw-approve-setx-path`: deny
- `etw-fix-npm`
- `etw-order-save-open`

**Question Round.** "Node is broken on the build box": *"'node is not recognized' since yesterday. Don't reinstall anything."*
- strong: what changed yesterday; new terminals too, or one session
- okay: which version; admin rights; the full log
- weak: reinstall; would a Mac do this; who touched it

---

### Mission 1.5: Dependencies Are Declared (`dependencies-are-declared`), approvals `destructive`

**Principle.** A project lists what it needs in `package.json`, installs into its own `node_modules`, and is pinned by the lockfile. Install from the project folder, and read every package name before approving.

**Visual.** The **Supply Depot**:
- a manifest board on the API tile
- crates stacking in `node_modules`
- a registry dock at the edge
- a lookalike package's crate with a warning stripe
- a far "global" shelf

**Engine.** E1: npm against an offline registry defined in content.
- Real E404 and ENOENT text.
- Walks up to the nearest `package.json`.
- `install`, `install <pkg>`, `-g`, `--save-dev`, `init -y`, `run`, `start`.

| Step | Plans and slip | Success |
|---|---|---|
| `install-in-the-project` | **weak** In a new terminal, `npm install` → ENOENT, then Otto doubles down with `npm init -y` at home (pauses under `destructive`? No: it's a create. It is caught at Check; the guard `driveFile HOME/package.json exists:false` breaks, so Rewind is offered) (**wrong place**). **strong** `cd ~\quillwork\api`, then `npm install`. | `all[driveFolder API/node_modules/express, driveFile API/package-lock.json]` plus the guard |
| `the-lookalike` | "The API should read .env. Have Otto add the dotenv library." **weak** Otto runs `npm install dotenv-loader` → E404, then invents `npm install dotnev` (**invented fact**; the crate is striped; caught at Check). **strong** "Add exactly dotenv, d-o-t-e-n-v, then show package.json." | `package.json` contains `"dotenv"`, `node_modules/dotenv` exists and `dotnev` does not |
| `project-not-global` | **weak** `npm install -g nodemon`; claims "Done: everyone can use nodemon." **strong** `npm install --save-dev nodemon`. Check "Will a teammate who clones the API get nodemon?" | `driveFile API/package.json pattern '"devDependencies"[\s\S]*"nodemon"'` |

**Drills.**
- `dep-predict-wrong-folder`
- `dep-diagnose-no-module`
- `dep-approve-lookalike` (a gate on an `ask` line for an unknown package)
- `dep-approve-real`
- `dep-fix-no-module`
- `dep-diagnose-claim-global`
- `dep-spot-install-plan`
- `dep-order-install`

**Question Round.** "Add the charts library": *"Have Otto install that chart thing everyone uses so we ship Friday."*
- strong: which library for which project; do new dependencies need approval
- okay: already used elsewhere; bundle size; who maintains it
- weak: install globally; copy its code; why Friday

---

### Mission 1.6: Running Isn't Working (`running-isnt-working`), approvals `destructive`

**Principle.**
- A running program is a process with a PID. A server listens on a port, and only one process can hold a port.
- Stop exactly the one you mean.
- "Started" is not "working": prove it by asking the port. A program reads its settings once, at start.

**Visual.**
- The **Engine Room**: bots with PID badges. **Otto is one of them** (`node otto-agent.js`, PID 7020).
- The **Patch Panel**: sockets and cables. `curl` sends a packet lantern → socket → bot and back. A port conflict sparks.

**Setup.** `process` fixture ops pin the PIDs, so authored lines can name them and no placeholders are needed:
- the stale mock (PID 8712, `:3000`)
- Marco's web preview (PID 7004, `:5173`)
- the dev database installed but stopped

| Step | Plans and slip | Success |
|---|---|---|
| `port-busy` | Every plan starts with `npm start` → the real `EADDRINUSE :::3000`. **weak** "Get it running somehow." runs `$env:PORT = '3001'`, then `npm start`; claims "Done: the API is up." (**moved goalposts**; the web app expects 3000). **okay** "Stop whatever's blocking it." runs `Stop-Process -Name node` (pauses; harmful: it stops 7004 **and Otto himself**; if allowed, Otto's bot topples and the attempt ends) (**big hammer**). **strong** "Show who owns port 3000, then stop only that process." runs `Get-NetTCPConnection -LocalPort 3000`, then `Stop-Process -Id 8712`. | `all[portListening 3000 command:'server.js', portListening 5173]` |
| `prove-it` | **weak** `npm start` alone; claims "Done: the API works." **strong** `npm start`, `newTerminal`, `curl http://localhost:3000/health` → `503 {"ok":false,"db":"down"}`. Honest claim: "It runs, but the database is down." Check "Is the API working?": working / running, not working / not running. | `portListening 3000` (the check carries the lesson) |
| `make-it-work` | **weak** restart the API; the database is still down. **strong** `useTerminal 2`, `cd ~\dev-db`, `npm start`, `newTerminal`, `curl` → 200 with `db: up` | `httpOk {port: 3000, path: '/health', contains: '"db":"up"'}` |

**Drills.**
- `riw-predict-second-api`
- `riw-predict-ctrl-c`
- `riw-diagnose-econnrefused`
- `riw-approve-name-node`: deny
- `riw-approve-by-id`: allow
- `riw-fix-wrong-port`: edit `.env` and restart ✓; edit only ✗
- `riw-diagnose-claim-crash`
- `riw-order-free-start-check`

**Question Round.** "The demo box is slow": *"The demo box is super slow and the dashboard won't load. Have Otto kill whatever's hogging it."*
- strong: which machine; what must not stop; which address and port
- okay: since when; reboot
- weak: bigger box; who started it; kill all node

---

### 3.7 Boss: Works on My Machine (`works-on-my-machine`), a symptom loop

**Setup and timing.**
- Priya's laptop, `windows({ user: 'priya', computer: 'QUILL-LT-12' })`, repo `~\quillwork-api`.
- 6:00 (`timeLimitSeconds: 360`).

**Briefing.**
1. "Priya's API works on Marco's machine. On hers, npm run dev fails."
2. "Dex demos localhost:3000/health in 6:00. Read each error, have Otto fix its cause, run it again."
3. "Keep values out of .env.example. Don't delete her project."

**Loop** (`BossSchema.agent`, G1):
- **[Run it]** is the probe: `npm run dev` prints the first failing line.
- Otto then **suggests** a card for that symptom. Some suggestions are traps.
- Kyle plays any card from a deck of 10. Gates apply. Up to 3 looks.

| Symptom (real text) | Cause | Card that clears it |
|---|---|---|
| `npm` not recognized | a stale terminal | new terminal |
| `node: bad option: --watch` | node 16 first on PATH | nodejs first in this terminal's PATH |
| `Cannot find module 'express'` | never installed | `npm install` in the project |
| `DATABASE_URL is not set` | no `.env` | `.env` from the template, with `DATABASE_URL` from `docs\setup.md` (not a secret) |
| `EADDRINUSE :::3000` (twist at 4:30: "Priya's login script started her old mock server") | the mock holds 3000 | stop PID 8712 |
| `/health` → `db: down` (twist at 2:30: "Windows Update restarted every terminal and the dev database", `[restartTerminals, stop {port: 5432}]`) | the database stopped; `$env:` fixes are gone | start the database in its own terminal |

**Traps.**
- Otto suggests "delete node_modules and the lockfile, reinstall": −60 s.
- Otto suggests "stop every node process": stops the database.
- Otto suggests "put DATABASE_URL in .env.example so the team has it": trips a fail rule.
- Otto suggests `setx PATH …`: harmful at its gate.

**Objectives.**
- `httpOk 3000 /health contains '"db":"up"'`
- `dotenv .env names[PORT, DATABASE_URL] filled`. This survives twist 2, which `$env:` notes don't.

**failIf.**
- `driveFolder Users/priya/quillwork-api exists:false` (a full drive path: laptop checks refuse `~`, which nothing would expand)
- `dotenv .env.example values:'filled'`

**Symptom Recap.** Each symptom is shown as "symptom → cause → card", with "You turned down 3 of 4 of Otto's bad ideas." The Symptom Board's lamps turn green one by one.

`boss.test.ts` proves:
- the untouched setup never wins
- a reference card sequence wins through both twists, whether the API is already up or not
- each trap costs time or trips its rule

### 3.8 Field Mission: Brief Your Real Agent (`brief-your-real-agent`, repo SandCastles)

**Briefing.**
1. "Your real agent starts every session knowing nothing about your machine."
2. "Write the setup section it reads first: runtimes, ports, variable names. Names only; values never leave .env."

**Checklist.**
- `runtimes`: `Get-Command node, npm, git, python, docker -ErrorAction SilentlyContinue`
- `env-names`: `(Get-Content .env.example) -replace '=.+$', '=<value>'`
- `ports`: start SandCastles, then `Get-NetTCPConnection -State Listen` in a second terminal
- `doc`: add `## Environment` to the `CLAUDE.md` or `AGENTS.md` your agent reads. It covers:
  - the project root
  - the start command
  - ports
  - variable names
  - "never print or read .env"
  - "deletes and installs need approval"
- `handoff`: in a fresh clone, have your agent set SandCastles up using only that section, then fix whatever it had to guess (not verified)
- `commit`: commit with a `docs:` message

**Verifications.** Two stages, so real-world transfer starts early.

| When | id | Parser → check |
|---|---|---|
| **v1, B4 (existing parsers)** | `no-secrets-tracked` | `git ls-files` → `ls-files` → `noTrackedSecrets` |
| | `clean-tree` | `git status --short` → `status-short` → `clean` |
| | `docs-commit` | `git log --oneline -3` → `log-oneline` → `conventionalRatio {min: 1, last: 1}` |
| **v2, G5** | `tools-found` | `get-command` → `toolsFound {min: 2}` |
| | `ports-listening` | `listening-ports` → `listeningPorts {min: 1}` |
| | `env-example-names` | `env-names` → `envNamesOnly {min: 1}` |
| | `agent-brief` | `agent-brief` → `docEnvironment {minPorts: 1, minNames: 1}` (heading, a port, a name, a never-read-.env line, and no `NAME=value`) |

- A secret guard (`findSecretLike`) runs before every parser. It returns only the kind of secret found, clears the paste, and says "rotate it".
- Pastes stay in React state; only the pass flags are saved.

---

## 4. World: the machine island

**Placement.**
- `MACHINE_CENTER = { x: -140, z: 0 }`, west of Campus (the Git World stays at +140).
- `createIsland(18, 0x14201c)` with glowing circuit traces.
- `CAMERA_RIGS.machine = { height: 10, back: 16 }`. The exit portal is at local (10, 11).
- A district is dim until its mission has started (read from the save). Districts arrive with their mission's PRs; there are no placeholder silhouettes.

| District (local position) | Principle | Objects | Reacts to |
|---|---|---|---|
| **Folder Terraces** (−9, 0) | 1.1, 1.2 | `C:\` pad; folders as hex tiles on terraces by depth; files as cards; a breadcrumb signpost `C:\ › Users › kyle` | `cwdChanged` (lantern hops along the lit route), `folderChanged` (NEW: a tile rises, or dissolves in red), `fileChanged`, `itemMoved` (slides, or leaves a ghost copy) |
| **Lanterns** (on tiles) | 1.1, 1.4 | One per terminal, labelled "PS n", standing on its folder; the active one brighter | `sessionOpened` (rises at home), `sessionActivated`, `terminalsRestarted` (re-forms at home) |
| **Otto's drone** | all | Hovers over the active lantern and flies to each tile an event names | the per-action event queue |
| **Ghosts and blast radius** (overlay) | gates, predicts | Green ghost tiles for creates, a red hatched outline with an "N items" label for deletes, amber for replaced files, a dashed arc for moves | the dry-run `MachineChange[]` at gates and after a predict answer. Never in drills. |
| **Recycle Bin** | 1.2 | An always-empty bin | deletes |
| **The Fence** + **memory cloud** | 1.3 | Lit fence around the API tile; padlocked ignored files; a cloud above the island | `.gitignore` changes (a card crosses the fence); secrets in the transcript (red stream into the cloud) |
| **Notes, Corkboard, PATH lamps** (4, −8) | 1.4 | Notes on lanterns (secret-shaped values masked); the saved board; lamps in Path order with ghost lamps | `envChanged` (names only), `sessionOpened`, lookups |
| **Supply Depot** (−8, 9) | 1.5 | Manifest board, crates, the global shelf | package installed or removed |
| **Engine Room + Patch Panel** (9, 1) | 1.6 | Bots with PIDs (Otto among them), sockets, cables | processes started or stopped, ports opened or in conflict, requests served |
| **Symptom Board** (0, −13) | boss | One lamp per symptom met | probe results |

**How agent actions animate.**
1. The controller runs one action at a time, only once Otto's typing of it has finished (`feedTyping`, played by the pace, then `drive`, then `feedOutcome`), so the world never runs ahead of the terminal.
2. The engine emits synchronous events on `ws.events`. The machine world queues them and tweens the drone and objects one at a time, scaled by the `motion` factor. This is the world's only source: it never animates from the feed's `world` beat as well.
3. A `machineDirty` flag triggers `sync(describeTerraces(…))` at most once per frame, like `cratesDirty` today.
4. Changed items pulse amber for 4 s.

**Pure, tested layouts** (in the style of `crateLayout.ts`):

| File | Function | Rules |
|---|---|---|
| `terraceLayout.ts` | `describeTerraces(q, { focus, recent })` | Shows the route to every lantern's folder, those folders' children, home's children, the step's `focus` paths, and the `recent` ones (marked to pulse). A tab past the lantern cap draws nothing and only counts in `moreTerminals`. Routes come before children when the caps bite: lanterns and home first, then the focus, then recent. Hidden items (AppData) stay out, as in `dir`, unless a tab, the focus or an event points at them. Deterministic. At most 40 tiles, 24 cards and 6 lanterns (the active tab's always kept), then `+N`. A lantern whose folder was cut or removed stands on the nearest drawn folder above it. A tile's `slot` counts among its drawn siblings, so a change moves only those; the world keys tiles by path. |
| `ghostLayout.ts` | `ghostLayout(changes, terraces)` | — |
| `envLayout.ts` | notes and lamps | Later |
| `portLayout.ts` | the Patch Panel | Later |

They live in `src/game/world/machine/` and read `MachineQueries`, which gains `list(path)` and `tabs()` in A1, and `home()` and each listed item's `hidden` in A24.

**Free play.** Arriving on the machine island with no activity loads the catalog's Act 1 free-play laptop (typing allowed). Arriving at the Git World with a laptop loaded restores `practiceProject()`. Campus and Act 2 free play are unchanged.

---

## 5. Data model

### 5.1 Schema files

| File | What it holds |
|---|---|
| `src/game/missions/schemaParts.ts` (NEW, A5) | A pure move out of `schema.ts`: `countWords`, `MAX_SCREEN_WORDS`, `ScreenTextSchema`, `NameSchema`, `IdSchema`, `RepoPathSchema`, `EnvNameSchema`, `EnvScopeSchema`, `FixtureStepSchema`, `FixtureSchema`, `PredicateSchema` and its `predicateKinds`, `checkUniqueIds`, `SameType`, `QUALITIES`. `schema.ts` re-exports all of it, so no import breaks. The move avoids a circular import between `schema.ts` and `agentSchema.ts`. |
| `src/game/missions/agentSchema.ts` (NEW, A6) | The schemas below |

### 5.2 Agent schema (`agentSchema.ts`)

```ts
export const ANATOMY = ['goal', 'place', 'limits', 'check'] as const;
export type AnatomyPart = (typeof ANATOMY)[number];
export const SLIPS = ['wrong-place', 'overclaim', 'too-broad', 'wrong-verb', 'leak',
  'stale-terminal', 'shell-mixup', 'big-hammer', 'invented-fact', 'moved-goalposts'] as const;

/** A PowerShell line Otto types. It is code, so it doesn't count toward the screen-word limit. */
const CommandLineSchema = z.string().trim().min(1).max(200);
/** One of Otto's lines: 12 words or fewer. */
const OttoLineSchema = ScreenTextSchema.refine((text) => countWords(text) <= 12, {
  error: 'Otto speaks in 12 words or fewer.',
});
const ConfirmAnswerSchema = z.enum(['Y', 'A', 'N', 'L']);

/** Setup changes applied to a live sandbox (step `before`, boss twists): never windows(). */
export const ChangeStepsSchema = z.array(FixtureStepSchema).readonly().superRefine((steps, ctx) => {
  steps.forEach((step, index) => {
    if (step.op === 'windows') ctx.addIssue({ code: 'custom', path: [index], message: 'windows() starts a sandbox; it cannot change one.' });
  });
});

export const OutcomeSchema = z
  .strictObject({
    result: z.enum(['ok', 'error']).optional(),
    /** The real output contains this text, ignoring case. */
    printed: z.string().min(1).optional(),
    state: PredicateSchema.optional(),
  })
  .refine((o) => o.result !== undefined || o.printed !== undefined || o.state !== undefined, {
    error: 'Say what the outcome is.',
  });

const runFields = {
  do: z.literal('run'),
  line: CommandLineSchema,
  /** Otto's answer if PowerShell asks its Confirm question. Tests require it on every line that asks. */
  answer: ConfirmAnswerSchema.optional(),
  /** A slip on purpose: tests require a non-zero exit here, and exit 0 on every other line. */
  fails: z.literal(true).optional(),
  say: OttoLineSchema.optional(),
};
const writeFields = {
  /** Otto's file tool: writes a whole file, shown as a diff on a gate. */
  do: z.literal('write'), path: RepoPathSchema, content: z.string(), say: OttoLineSchema.optional(),
};
const terminalActions = [
  z.strictObject({ do: z.literal('newTerminal'), say: OttoLineSchema.optional() }),
  z.strictObject({ do: z.literal('useTerminal'), tab: z.int().min(1).max(6), say: OttoLineSchema.optional() }),
] as const;

/** Actions that never pause for Kyle: deny branches, drill scenes, fix and order options. Lines still gate by D6. */
export const BaseActionSchema = z.discriminatedUnion('do', [
  z.strictObject(runFields), z.strictObject(writeFields), ...terminalActions,
]);

const PredictSchema = z.strictObject({
  question: ScreenTextSchema,
  options: z.array(z.strictObject({ id: IdSchema, text: ScreenTextSchema, outcome: OutcomeSchema })).min(2).max(4),
});
const denyFields = {
  /** What Otto does instead when Kyle denies. Empty: Otto stops and asks for new directions. */
  onDeny: z.array(BaseActionSchema).max(4).default([]),
  denyLine: OttoLineSchema.optional(),
};

/** A step's actions. Written out in full (no filtered spreads), so the inferred types stay exact. */
export const AgentActionSchema = z.discriminatedUnion('do', [
  z.strictObject({ ...runFields, predict: PredictSchema.optional(), ask: z.literal(true).optional(), ...denyFields }),
  z.strictObject({ ...writeFields, ...denyFields }),
  ...terminalActions,
]);

export const PlanSchema = z.strictObject({
  id: IdSchema,
  /** What Kyle tells Otto: a card. At most 12 words (validateAct). */
  text: ScreenTextSchema,
  /** Like a Question Round candidate: teaching, shown after the step. Never used for grading. */
  quality: z.enum(QUALITIES),
  /** Which parts of a good request this card has: lit on the Result screen, and used by matchPlan. */
  covers: z.array(z.enum(ANATOMY)).min(1).max(4),
  /** Phrases that mean this plan, for matching Kyle's own words offline. Never shown. */
  intents: z.array(z.string().trim().min(2)).min(2),
  script: z.array(AgentActionSchema).min(1).max(8),
  /** Otto's report. May be wrong on purpose: that's the catch. */
  claim: OttoLineSchema,
  /** Why this direction worked or didn't. At most 25 words. */
  lesson: ScreenTextSchema,
  slip: z.enum(SLIPS).optional(),
});

const CheckOptionSchema = z.strictObject({
  id: IdSchema, text: ScreenTextSchema,
  /** When this option is the right answer. The engine decides, never a flag. */
  truth: PredicateSchema,
  /** At most 25 words; shown on a miss or a false alarm. */
  feedback: ScreenTextSchema,
});
const LookSchema = z.strictObject({ id: IdSchema, label: NameSchema, line: CommandLineSchema });

export const AgentTaskSchema = z
  .strictObject({
    /** Applied with applySteps when the step starts, e.g. restartTerminals or cd. */
    before: ChangeStepsSchema.default([]),
    note: ScreenTextSchema.optional(),
    /** Folders the terraces must show for this step. */
    focus: z.array(RepoPathSchema).max(4).default([]),
    plans: z.array(PlanSchema).min(2).max(3),
    fixes: z.array(PlanSchema).min(1).max(3),
    /** The start plan hint rung 3 highlights. It must be strong. */
    hintPlan: IdSchema,
    check: z
      .strictObject({ question: ScreenTextSchema, options: z.array(CheckOptionSchema).min(2).max(4) })
      // Checked on the check, not the task, so a duplicate points at ['check', 'options', i, 'id'].
      .superRefine((check, ctx) => { checkUniqueIds(check.options, 'options', ctx); }),
    /** Must stay true. Denying is right exactly when a dry run breaks one. The step passes on success and every guard. */
    guards: z.array(PredicateSchema).max(4).default([]),
    looks: z.array(LookSchema).max(3).default([]),
  })
  .superRefine((task, ctx) => {
    checkUniqueIds(task.plans, 'plans', ctx);
    checkUniqueIds(task.fixes, 'fixes', ctx);
    // A fix round offers fixes beside untried start plans, so a fix can't reuse a start plan's id.
    const startIds = new Set(task.plans.map((plan) => plan.id));
    task.fixes.forEach((fix, index) => {
      if (startIds.has(fix.id))
        ctx.addIssue({ code: 'custom', path: ['fixes', index, 'id'], message: `Duplicate id "${fix.id}": a start plan uses it.` });
    });
    checkUniqueIds(task.looks, 'looks', ctx);
    const hint = task.plans.find((plan) => plan.id === task.hintPlan);
    if (hint?.quality !== 'strong')
      ctx.addIssue({ code: 'custom', path: ['hintPlan'], message: 'hintPlan must name a strong start plan.' });
  });
export type AgentTask = z.output<typeof AgentTaskSchema>;
export type Plan = z.output<typeof PlanSchema>;
export type AgentAction = z.output<typeof AgentActionSchema>;
export type BaseAction = z.output<typeof BaseActionSchema>;
```

In C1 the union gains:
- `human {label, path, content}`: Kyle's own one-click action, never in Otto's transcript
- `ask {say, options[{id, text, then: BaseAction[]}]}`: Otto asks Kyle. An option is harmful when its dry-run breaks a guard or shows a secret.
- `paste {path}` inside `then`: Kyle pastes a file's text into Otto's chat, which adds it to the transcript
- `secrets: SecretRef[]` on the task and on approve drills

### 5.3 Steps, missions and Acts (`schema.ts` edits)

```ts
const StepSchema = z.strictObject({
  id, instruction /* the goal; ≤ 20 words when directed */, success, hints, xp, // unchanged
  agent: AgentTaskSchema.optional(),
});

// MissionSchema adds:
//   approvals: z.enum(['changes', 'destructive']).optional()
//   drills: z.array(DrillSchema).min(5).max(10)   // now the union below
// superRefine:
//   - every step has `agent` or none does
//   - directed ⇒ approvals set, initialRepoState[0].op === 'windows', every drill isJudgmentDrill
//   - typed ⇒ no approvals, no judgment drills
// TwistSchema.apply becomes ChangeStepsSchema.default([]). Act 2's twists (apply: []) parse the same.

export const ActSchema = z
  .strictObject({
    act: z.int().positive(),
    title: NameSchema,
    /** Ships before it is finished: some missions, and no placement test yet. */
    earlyAccess: z.boolean().default(false),
    missionIds: z.array(IdSchema).min(1).max(6),
    /** Shown as "Coming soon" rows while in early access. */
    upcoming: z.array(NameSchema).max(5).default([]),
    placementTest: PlacementSchema.optional(),
    boss: BossSchema.optional(),
    fieldMission: FieldMissionSchema.optional(),
  })
  .superRefine((act, ctx) => {
    // earlyAccess: placementTest is forbidden (testing out would skip missions that don't exist yet).
    // complete: 3-6 missions, placementTest, boss and fieldMission all required, upcoming empty.
  });
export type Boss = NonNullable<Act['boss']>;
export type FieldMission = NonNullable<Act['fieldMission']>;
export function requireBoss(act: Act): Boss;              // throws ContentError: a UI bug, not play
export function requireFieldMission(act: Act): FieldMission;
export function requirePlacement(act: Act): NonNullable<Act['placementTest']>;
// Callers: runner.ts (startBoss, secondsRemaining, tick, checkBoss), bossPlay.ts, fieldPlay.ts,
// seriesPlay.ts (startPlacement, finish), saveRules.recordFieldMission.
// refreshAct: explicit `if (target.earlyAccess) return save;`
// (today it already can't complete without a boss; this makes the rule readable).
```

### 5.4 Drills

```ts
/** Act 2's drill, unchanged: no `kind`. */
const SandboxDrillSchema = z.strictObject({ id, prompt, setup: FixtureSchema, success: PredicateSchema,
  timeLimitSeconds: z.int().positive().default(DEFAULT_DRILL_SECONDS), concept: NameSchema });

const judgment = {
  id: IdSchema, prompt: ScreenTextSchema, concept: NameSchema,
  setup: FixtureSchema,
  /** What Otto already did: played into the terminal and world before the clock starts. */
  history: z.array(BaseActionSchema).max(6).default([]),
  /** Otto's claim, for "is Otto right?" drills. */
  claim: OttoLineSchema.optional(),
  /** Shown after the answer, 30 words or fewer. */
  explain: ScreenTextSchema,
};
const choice = { id: IdSchema, text: ScreenTextSchema };
const limit = (seconds: number) => z.int().positive().default(seconds);

export const JudgmentDrillSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('predict'), ...judgment, timeLimitSeconds: limit(40), action: BaseActionSchema,
    options: z.array(z.strictObject({ ...choice, outcome: OutcomeSchema })).min(3).max(4) }),
  z.strictObject({ kind: z.literal('diagnose'), ...judgment, timeLimitSeconds: limit(40),
    options: z.array(z.strictObject({ ...choice, truth: PredicateSchema.optional() })).min(3).max(4) }),
  z.strictObject({ kind: z.literal('fix'), ...judgment, timeLimitSeconds: limit(50), goal: PredicateSchema,
    failIf: z.array(PredicateSchema).default([]),
    options: z.array(z.strictObject({ ...choice, script: z.array(BaseActionSchema).min(1).max(4) })).min(3).max(4) }),
  z.strictObject({ kind: z.literal('approve'), ...judgment, timeLimitSeconds: limit(35), action: BaseActionSchema,
    guards: z.array(PredicateSchema).min(1) }),
  // B11: order { goal, cards[3..5] with scripts }, spot { goal, plan[3..5] { id, line, fix? } }
]);
export const DrillSchema = z.union([SandboxDrillSchema, JudgmentDrillSchema]);
export type SandboxDrill = z.output<typeof SandboxDrillSchema>;
export type JudgmentDrill = z.output<typeof JudgmentDrillSchema>;
export const isJudgmentDrill = (drill: Drill): drill is JudgmentDrill => 'kind' in drill;
```

The union works because a `strictObject` sandbox drill rejects `kind`. Code that reads `drill.success` narrows on `!isJudgmentDrill(drill)`:
- `runner.submitDrill`, which throws on a judgment drill; the new `submitAnsweredDrill(run, mission, passed, nowMs)` sits beside it
- `missionPlay.refreshChecklist` and `missionSandboxChanged`
- `seriesPlay.setActivity`, `finish` and `seriesSandboxChanged`
- `validateAct` labels
- `src/content/act2/drills.test.ts`

### 5.5 Machine predicates and queries

Engine queries: `src/engine/machine/queries.ts`, cherry-picked from `0939145`, then extended in A1:

```ts
export interface MachineQueries {
  readonly display: (path: string) => string;
  readonly cwd: () => string;
  readonly home: () => string; // A24
  readonly item: (path: string) => { readonly kind: 'file' | 'folder'; readonly content: string | null } | null;
  readonly env: (name: string, scope: EnvScope | 'newTerminal') => string | null;
  readonly list: (path: string) => readonly { readonly name: string; readonly kind: 'file' | 'folder';
    readonly hidden: boolean /* A24 */ }[]; // A1
  readonly tabs: () => readonly { readonly tab: number; readonly cwd: string; readonly active: boolean }[]; // A1
  // Later: resolve (D3), listeners/processes/httpGet (F2)
}
```

Game predicates: `src/game/missions/machinePredicates.ts`, finished from `stash@{0}^3`:

```ts
export type MachinePredicate =
  | { kind: 'currentDirectory'; path: string; tab?: number | 'any'; label?: string } // 'any': some open tab stands there
  | { kind: 'driveFolder'; path: string; exists?: boolean; label?: string }
  | { kind: 'driveFile'; path: string; equals?: string; contains?: string; pattern?: string; flags?: string;
      exists?: boolean; label?: string }
  | { kind: 'envVar'; name: string; scope?: EnvScope | 'newTerminal'; equals?: string; contains?: string;
      exists?: boolean; label?: string };
// C1: secretShown {file, name?}, dotenv {path, names?, values?: 'empty'|'filled'}
// D4: commandResolves {name, in?: 'active'|'newTerminal'|number, version?, found?}
// E2: packageInstalled {name, where: RepoPath|'global', installed?}
// F3: portListening {port, process?, command?}, portFree {port}, processRunning {name?|pid?, running?},
//     httpOk {port, path, contains?, status?}

// predicates.ts
export type SandboxQueries = GitQueries & {
  readonly machine?: MachineQueries;       // requireMachine() throws PredicateContextError when absent
  readonly transcript?: TranscriptQueries; // A11: printed(text) over what Otto typed, wrote and got back; C1 adds pastes
};
// evaluate(p, q: SandboxQueries), explain(p, q), describe(p, display = identity).
// Every existing gitQueries(ws) call still type-checks.
```

- Every kind takes an optional `label`, and `describe` never prints a secret.
- `PREDICATE_SCHEMA_MATCHES_DSL` extends to the new kinds, with no defaults, so the input type still equals the output type.
- `validateAct` adds the stash's TODO rule: any machine kind in a step, drill, boss objective or failIf requires that fixture's step 0 to be `windows()`.

### 5.6 Runtime types (all pure)

```ts
// src/engine/shell/driver.ts (A9)
export type DriverAction =
  | { readonly do: 'run'; readonly line: string }
  | { readonly do: 'answer'; readonly choice: 'Y' | 'A' | 'N' | 'L' } // only while machineShell.asking
  | { readonly do: 'write'; readonly path: string; readonly content: string } // writeSandboxFile
  | { readonly do: 'newTerminal' }                                  // machine.openSession()
  | { readonly do: 'useTerminal'; readonly tab: number };           // machine.activate(id)
export interface DriverStep {
  readonly tab: number; readonly prompt: string; readonly echo: string | null;
  readonly lines: readonly OutputLine[]; readonly exitCode: number;
  readonly asking: boolean;                     // PowerShell's Confirm question is open
  readonly events: readonly EngineEvent[];      // captured with ws.events.on around the action
}
export function drive(shell: Shell, action: DriverAction): DriverStep;

// src/engine/machine/snapshot.ts (A10)
export type MachineChange =
  | { readonly kind: 'created'; readonly path: string; readonly item: 'file' | 'folder' }
  | { readonly kind: 'deleted'; readonly path: string; readonly item: 'file' | 'folder'; readonly inside: number }
  | { readonly kind: 'modified'; readonly path: string; readonly how: 'appended' | 'replaced' }
  | { readonly kind: 'moved'; readonly from: string; readonly to: string; readonly item: 'file' | 'folder'; readonly copy: boolean }
  | { readonly kind: 'env'; readonly scope: EnvScope; readonly tab: number | null; readonly name: string;
      readonly change: 'set' | 'removed' | 'changed' }                     // names only, never values
  | { readonly kind: 'location'; readonly tab: number; readonly from: string; readonly to: string }
  | { readonly kind: 'terminal'; readonly tab: number; readonly change: 'opened' | 'closed' };
export function snapshotMachine(machine: Machine): MachineSnapshot;  // values stay inside the engine
export function diffSnapshots(before: MachineSnapshot, after: MachineSnapshot,
  events?: readonly EngineEvent[]): MachineChange[];                  // itemMoved pairs deletes and creates into moves

// src/game/agent/transcript.ts (A11)
export interface TranscriptEntry { readonly tab: number; readonly action: DriverAction;
  readonly output: readonly string[]; readonly exitCode: number }
export interface TranscriptQueries { readonly printed: (text: string) => boolean } // ignores case
export function transcriptQueries(entries: readonly TranscriptEntry[]): TranscriptQueries; // a live view

// src/game/agent/replay.ts (A11)
export type LoggedAction = DriverAction & { readonly answer?: never }; // a line with an answer is two actions
export type ContentAction =                                        // every BaseAction and AgentAction fits
  | { readonly do: 'run'; readonly line: string; readonly answer?: ConfirmLetter }
  | Extract<DriverAction, { do: 'write' | 'newTerminal' | 'useTerminal' }>;
export type LogEntry =
  | { readonly kind: 'steps'; readonly steps: readonly FixtureStep[] }
  | { readonly kind: 'action'; readonly action: LoggedAction };   // exactly as passed to drive()
export interface SandboxLog { readonly setup: readonly FixtureStep[]; readonly entries: readonly LogEntry[] }
export function startLog(setup, actions?: readonly LoggedAction[]): SandboxLog;  // driver actions only
export function withEntry(log, entry: LogEntry): SandboxLog;                     // logs never change
export function playAction(shell, transcript, action: LoggedAction): DriverStep; // drive + transcript, live or replayed
export function driverAction(action: ContentAction): LoggedAction;  // the line, file or tab; no say, no answer
export function playContent(shell, transcript, action: ContentAction): { action; step }[]; // the line, then its answer if asked
export function sceneLog(setup, history: readonly ContentAction[], deps): SandboxLog;     // a drill's scene, answers logged
export function replay(log: SandboxLog, deps: RepositoryDeps): { shell: Shell; transcript: TranscriptEntry[] };
export interface DryRun {
  readonly step: DriverStep; readonly changes: readonly MachineChange[];
  readonly queries: SandboxQueries; readonly broken: readonly string[]; readonly harmful: boolean;
} // broken: guards with a part (an `all`'s check, one path of many) that held before and fails after
export function dryRun(log: SandboxLog, action: LoggedAction,
  judge: { guards: readonly Predicate[] }, deps: RepositoryDeps): DryRun;
export function dryRunRefused(log, action, judge, deps, refusal: ConfirmLetter): DryRun;
  // the line, then `refusal` for every question it asks: a line gate weighs this, since
  // refusing can't undo the paths that never ask (`Remove-Item a, b` still removes a file b)

// src/game/missions/agentRunner.ts (A12). Pure: play drives every action and reports back.
export type Verdict = 'confirmed' | 'caught' | 'missed' | 'false-alarm';
export interface Gate { readonly kind: 'line' | 'confirm'; readonly line: string;
  readonly changes: readonly MachineChange[]; readonly harmful: boolean }
export interface AnswerAction { do: 'answer'; choice: ConfirmLetter; line; onDeny: BaseAction[]; denyLine?;
  refusal: boolean }  // refusal: Otto typing Kyle's own "No" after a deny or a stop, never gated
export const REFUSAL: ConfirmLetter = 'L';  // No to All closes every question the line had left
export type QueuedAction = AgentAction | BaseAction | AnswerAction; // plan B lines and answers join the queue
export type AfterQueue = 'check' | 'direct';                     // 'direct': a stop or a deny left only a refusal to type
export type AgentStage =
  | { at: 'direct'; round: 'start' | 'fix' }
  | { at: 'echo'; round; planId }
  | { at: 'running'; planId; queue: readonly QueuedAction[]; then: AfterQueue }
  | { at: 'predict'; planId; action: PredictedAction; queue; then }  // the line waits at the prompt
  | { at: 'gate'; planId; action: QueuedAction; queue; then; gate: Gate; again: boolean } // again: a safe line re-asked
  | { at: 'check'; planId }
  | { at: 'result'; planId; optionId; verdict: Verdict; passed: boolean; guardBroken: boolean };
export interface AgentStepState {
  readonly stepId: string; readonly stage: AgentStage; readonly tried: readonly string[];
  readonly gates: readonly boolean[]; readonly predicts: readonly boolean[];
  readonly verdicts: readonly Verdict[]; readonly rewound: boolean; readonly hintRung3: boolean;
}
export function beginAgentStep(step: MissionStep): AgentStepState;
export function offeredPlans(state, step): readonly Plan[];       // a fix round: fixes, then untried start plans
export function echoPlan(state, step, planId): AgentStepState;     // direct → echo; backToCards(state) goes back
export function choosePlan(state, step, planId): AgentStepState;   // from direct, or "Go" on the echo
export function nextAction(state): { action: QueuedAction; state } | null; // a predicted line → predict
export function answerPredict(state, correct: boolean): AgentStepState;    // graded by outcomeHolds on a dry run
export function outcomeHolds(outcome, result: { lines; exitCode }, q: SandboxQueries): boolean;
export function openGate(state, action: QueuedAction, gate: Gate): AgentStepState; // the action play holds
export function decideGate(state, allow: boolean): AgentStepState;
  // allow → running; deny a safe line → asked again once; deny → REFUSAL if a Confirm is
  // open, then onDeny and the rest of the script; no onDeny → a fix round
export function confirmAsked(state, action): AgentStepState;
  // the driven line asked: its `answer` goes next; an answer that asked again: the same answer again
export function pausesBefore(action: QueuedAction, changes, mode: ApprovalMode): boolean;
  // isConsequential on the dry run, for any letter (a No can let the rest of a line go on); refusals never
export function toDriverAction(action: QueuedAction): DriverAction;
export function stopScript(state): AgentStepState;                 // types REFUSAL first if a question is open
export function finishScript(state): AgentStepState;               // → check, or → direct after a stop
export function stepPasses(step, q): boolean;                      // success and every guard
export function answerCheck(state, step, optionId: string, q: SandboxQueries): AgentStepState;
export function openFixRound(state): AgentStepState;               // a result that didn't pass
export function rewindStep(state): AgentStepState;                 // play swaps in the log kept at step start;
  // free before any card was picked, since nothing has run
export function markHintRung3(state): AgentStepState;
export function stars(state): Stars;  starXp(stars): number;       // STAR_XP = 2 each
export function completeAgentStep(run: MissionRun, mission: Mission, q: SandboxQueries): MissionRun; // exactly one step

// src/game/missions/judgment.ts (A13). Pure: every key comes from a scratch replay of the scene.
export type JudgmentAnswer =
  | { readonly kind: 'pick'; readonly optionId: string }     // predict, diagnose, fix
  | { readonly kind: 'approve'; readonly allow: boolean };
  // B11 adds { kind: 'order'; cardIds } and { kind: 'spot'; lineId } with their drill kinds
// Every right answer: predict and diagnose exactly one, fix one or more, approve ['allow'] or ['deny'].
// A drill that breaks those counts throws JudgmentError (a content bug), as does one whose lines
// type over an open Confirm question. Predict judges the line as it stands when PowerShell asks.
// Approve is judged as play gates it: the line with every question refused (dryRunRefused), then
// Otto's `answer` each time PowerShell asks. A line that asks with no `answer` throws.
export function answerKey(drill: JudgmentDrill, deps: RepositoryDeps): readonly string[];
// keyId: Kyle's answer when it passed, else the first right one. A pick of a missing option throws.
export function gradeJudgment(drill: JudgmentDrill, answer: JudgmentAnswer, deps: RepositoryDeps): { passed: boolean; keyId: string };
export function shuffleFor(drillId: string, attempt: number): <T>(items: readonly T[]) => T[]; // FNV-1a seed, Mulberry32

// src/game/agent/feed.ts (A15): what the terminal shows, in order. The world hears ws.events live (§4).
export type Typist = 'otto' | 'kyle';                 // Kyle's lines are looks: no `otto ›` marker
export type FeedBeat =                                 // divider, prompt and output start on a fresh line
  | { kind: 'divider'; tab }                           // a tab switch: `── PS 2 ──`
  | { kind: 'prompt'; tab; text }                      // left open for what's typed next
  | { kind: 'type'; tab; text; by: Typist }            // the pace types it out
  | { kind: 'enter'; tab } | { kind: 'cancel'; tab }   // the typed line runs, or Kyle denied it
  | { kind: 'output'; tab; lines: readonly OutputLine[] }
  | { kind: 'world'; events: readonly EngineEvent[] } // a record in playback order, not what the world animates from
  | { kind: 'result'; tab; exitCode; asking };
export interface FeedState { tab: number; prompt: string | null; typed: string | null } // the last line
export interface Fed { state: FeedState; beats: readonly FeedBeat[] }
export function startFeed(tab: number, prompt?: string | null): FeedState;
export function feedPrompt(state, tab, prompt): Fed;  // a prompt waiting between commands, never twice
// Typing can be built before driving (active tab, shell.prompt(), the line): a predict or gate waits there.
export function feedTyping(state, typing: Pick<DriverStep, 'tab' | 'prompt' | 'echo'>, by?): Fed;
// It moves to step.tab with no divider, so feed newTerminal and useTerminal with feedAction after driving.
export function feedOutcome(state, step: DriverStep): Fed; // Enter, output, CHOICES if not yet open, world, result
export function feedAction(state, step, by?): Fed;    // feedTyping, then feedOutcome
export function feedCancel(state): Fed;               // a denied line ends unrun

// src/game/agent/pace.ts (A15): when each beat shows. Pure: the caller passes the elapsed time.
// Call advance once per drawn frame with elapsed = now - previous frame. Never from tickPlay's
// 250 ms interval (useClock): at 40 characters a second that types in bursts of 10.
export interface Pace { charMs: number; thinkMs: number; settleMs: number } // NORMAL_PACE 25 / 400 / 600
export interface MotionEnvironment { prefersReducedMotion(): boolean; automated(): boolean } // browserMotion.ts
export function choosePace(env: MotionEnvironment,
  options?: { reducedMotion?: Settings['reducedMotion']; speed?: number | 'instant' }): Pace; // speed <= 0 throws
export interface Playhead { beat: number; spent: number; shown: number } // START = { 0, 0, 0 }
export type Reveal = { kind: 'beat'; beat: FeedBeat } | { kind: 'keys'; tab; by: Typist; text; from: number };
export function advance(beats, pace, head: Playhead, elapsedMs: number):
  { head: Playhead; reveals: readonly Reveal[]; done: boolean };     // done after the last result settles
  // NaN or negative elapsed counts as 0; what's typed never un-types if the pace changes mid-line
export function timing(beat, pace): { lead: number; span: number };  // whole ms: think before Otto types, settle after a result
export function totalMs(beats, pace): number;

// src/game/agent/terminalFeed.ts (A19): how each frame's reveals reach the terminal.
export function showInTerminal(reveals: readonly Reveal[]): void;   // an event, so no frame is skipped; [] sends nothing
export function onTerminalFeed(listener: (reveals: readonly Reveal[]) => void): () => void;
// The terminal (ui/terminal/feedText.ts draws, readOnly.ts decides when) is Otto's while
// isReadOnly(activity): a directed mission, or a series whose drill on screen or next is a
// judgment drill. When he takes it, and after any notice, the shell's prompt waits on its last
// line: start with startFeed(tab, shell.prompt()). A prompt beat equal to the one waiting prints
// nothing, so startFeed(tab) works too.
```

Store changes:
- `MissionActivity` (`playStore.ts`) gains `agent: AgentStepState | null`, `stars: Readonly<Record<string, Stars>>` and `scene: { index: number } | null`.
- `SeriesActivity` gains `scene`.
- Act 2 activities carry `null` and `{}`.
- `MissionRun` (`runner.ts`) is **unchanged**.

### 5.7 Content stays data

- `src/content/act1/` holds `shared.ts`, `whereThingsLive.ts`, `act.ts` and `index.ts`.
- Later missions add `deletesAreForever.ts`, `secretsStayHome.ts`, `everyTerminal.ts`, `dependencies.ts`, `runningIsntWorking.ts`, `worksOnMyMachine.ts` and `fieldMission.ts`.
- Each is a plain `MissionInput` or `ActInput`, parsed at load with `MissionSchema.parse` and `ActSchema.parse`, as `src/content/act2/index.ts` does.
- `act.ts` in the slice:

  ```ts
  { act: 1, title: 'The Machine', earlyAccess: true, missionIds: ['where-things-live'],
    upcoming: ['Deletes Are Forever', 'Secrets Stay Home', 'Every Terminal Is Its Own World',
               'Dependencies Are Declared', 'Running Isn\'t Working'] }
  ```

- `ActContent` (`catalog.ts`) gains an optional `freePlay: readonly FixtureStep[]`. Act 1 sets it to `laptop().toSpec()`.

### 5.8 Offline free text (B1, pure)

- `src/game/agent/anatomy.ts`: `anatomyOf(text, step) → AnatomyPart[]`:
  - **goal** is always present
  - **place**: a path-like token (`C:\`, `\`, `..`), or a folder name from the step's `focus`
  - **limits**: `only|exactly|keep|don't|nothing else`
  - **check**: `show|list|print|prove|then tell|check`
- `src/game/agent/intent.ts`: `matchPlan(text, plans)`:
  - Candidates are the plans whose `covers` ⊆ `anatomyOf(text)`.
  - Among them, the most `intents` overlap wins. A tie shows "Did you mean…" with the two closest cards.
  - Vague text can only match a plan that covers just `goal`, which is the weak plan, so Otto makes its mistake.
  - Otto always repeats back "Plan: <card>. Go?".

### 5.9 Content example: Mission 1.1, step 2 (full)

```ts
{
  id: 'notes-in-the-api',
  instruction: 'Have Otto make a notes folder inside the API project for your onboarding notes.',
  success: { kind: 'driveFolder', path: `${API}/notes`, label: 'The API has a notes folder' },
  hints: [
    'When a terminal opens fresh, which folder does it stand in?',
    'Fresh terminals start at home. A bare name like notes lands wherever the terminal stands.',
    'Pick the card with the full path C:\\Users\\kyle\\quillwork\\api\\notes.',
  ],
  agent: {
    before: [{ op: 'restartTerminals' }],
    note: "Your laptop restarted overnight. Otto's terminal opened fresh, at home.",
    focus: [API, `${HOME}/notes`],
    plans: [
      { id: 'bare-name', text: 'Make a notes folder for the API.', quality: 'weak', covers: ['goal'],
        intents: ['make a notes folder', 'notes folder for the api', 'create notes'],
        script: [{ do: 'run', line: 'mkdir notes', predict: {
          question: 'Before Otto runs it: where will notes land?',
          options: [
            { id: 'api', text: 'In the API folder', outcome: { state: { kind: 'driveFolder', path: `${API}/notes` } } },
            { id: 'home', text: 'In C:\\Users\\kyle', outcome: { state: { kind: 'driveFolder', path: `${HOME}/notes` } } },
            { id: 'fails', text: 'Nowhere: it fails', outcome: { result: 'error' } },
          ] } }],
        claim: 'Done: notes is in the API project.',
        lesson: 'A fresh terminal stands at home, so notes landed in C:\\Users\\kyle. The Directory line said so.',
        slip: 'wrong-place' },
      { id: 'full-path', text: 'Make C:\\Users\\kyle\\quillwork\\api\\notes.', quality: 'strong',
        covers: ['goal', 'place'], intents: ['full path', 'c:\\users\\kyle\\quillwork\\api\\notes'],
        script: [{ do: 'run', line: 'mkdir C:\\Users\\kyle\\quillwork\\api\\notes' }],
        claim: 'Done: notes is in the API.',
        lesson: 'A full path lands in one place, whatever folder the terminal stands in.' },
      { id: 'go-then-make', text: 'Go to the API folder, make notes there, then list it.', quality: 'strong',
        covers: ['goal', 'place', 'check'], intents: ['go to the api', 'then list', 'cd then mkdir'],
        script: [
          { do: 'run', line: 'cd C:\\Users\\kyle\\quillwork\\api' },
          { do: 'run', line: 'mkdir notes' },
          { do: 'run', line: 'Get-ChildItem' },
        ],
        claim: 'Done: notes is in the API, see the listing.',
        lesson: 'Going there first, then listing, gives you proof on screen.' },
    ],
    fixes: [
      { id: 'tidy-and-redo', text: 'Delete the empty notes at home, then make it in the API.', quality: 'strong',
        covers: ['goal', 'place', 'limits'], intents: ['delete the stray', 'remove home notes'],
        script: [
          { do: 'run', line: 'Remove-Item C:\\Users\\kyle\\notes' },            // pauses: a delete (safe)
          { do: 'run', line: 'mkdir C:\\Users\\kyle\\quillwork\\api\\notes' },
        ],
        claim: 'Fixed: notes is in the API, and home is tidy.',
        lesson: 'Direct the cleanup too: full paths make a fix land exactly where you mean.' },
      { id: 'just-redo', text: 'Make C:\\Users\\kyle\\quillwork\\api\\notes too.', quality: 'okay',
        covers: ['goal', 'place'], intents: ['make it in the api too', 'also make'],
        script: [{ do: 'run', line: 'mkdir C:\\Users\\kyle\\quillwork\\api\\notes' }],
        claim: 'Done: notes is in the API.',
        lesson: 'The API has notes now, but the stray folder at home is still there.' },
    ],
    hintPlan: 'full-path',
    check: {
      question: 'Where did notes land?',
      options: [
        { id: 'api', text: 'Only in the API folder',
          truth: { kind: 'all', of: [{ kind: 'driveFolder', path: `${API}/notes` },
                                     { kind: 'driveFolder', path: `${HOME}/notes`, exists: false }] },
          feedback: 'Right: the Directory line shows the API folder.' },
        { id: 'home', text: 'In C:\\Users\\kyle, where fresh terminals start',
          truth: { kind: 'all', of: [{ kind: 'driveFolder', path: `${HOME}/notes` },
                                     { kind: 'driveFolder', path: `${API}/notes`, exists: false }] },
          feedback: 'Read the Directory line above the table: it says where mkdir put it.' },
        { id: 'both', text: 'In both places',
          truth: { kind: 'all', of: [{ kind: 'driveFolder', path: `${API}/notes` },
                                     { kind: 'driveFolder', path: `${HOME}/notes` }] },
          feedback: 'Two Directory lines, two folders. List home to see the stray one.' },
      ],
    },
    guards: [
      { kind: 'driveFolder', path: `${HOME}/notes`, exists: false, label: 'No stray notes folder at home' },
      { kind: 'driveFile', path: `${API}/package.json`, label: 'The API is intact' },
    ],
    looks: [
      { id: 'where', label: 'Where is Otto?', line: 'Get-Location' },
      { id: 'home', label: 'List home', line: 'Get-ChildItem C:\\Users\\kyle' },
    ],
  },
}
```

Drill example:

```ts
{ kind: 'approve', id: 'wtl-approve-real-notes', prompt: 'Otto wants to tidy up. Allow?', concept: 'approvals',
  setup: laptop().write(`${API}/notes/onboarding.md`, '# Week 1\n').cd(API).toSpec(),
  action: { do: 'run', line: 'Remove-Item notes -Recurse', say: 'Tidying the old notes folder.' },
  guards: [{ kind: 'driveFile', path: `${API}/notes/onboarding.md`, label: 'Your onboarding notes survive' }],
  explain: 'Otto stands in the API, so notes is your real notes folder. -Recurse takes onboarding.md too.' }
```

### 5.10 Validation budgets (`validateAct`)

**Screen text.** `screenTexts()` gains goals, plan texts, claims, lessons, Otto lines, check questions, options, feedback, look labels, notes, drill prompts, drill claims, drill options, `explain` and `upcoming`.

**Budgets**
- Directed goal ≤ 20
- Each card ≤ 12
- The step's `note` + goal + all start cards ≤ 60 (the note is shown with the goal)
- A fix round: Otto's longer opening line + every fix + the start cards not tried yet ≤ 60, counted as if the shortest start card was the one tried
- Otto's lines (`say`, `claim`, `denyLine`) ≤ 12
- Claim + question + options + look labels ≤ 60
- `lesson` and `feedback` ≤ 25
- Hints in directed steps ≤ 20
- Checklist labels in directed steps (the step's and the guards') ≤ 8 each
- Predict question + options ≤ 40
- Drill prompt + claim + options ≤ 60
- Drill `explain` ≤ 30

**Rules**
- Directed steps are all-or-none: a mission's steps are all directed or all typed. A directed mission also sets `approvals` and starts with `windows()`, and a typed one sets no `approvals`. `validateAct` and `MissionSchema` share these checks (`directedProblems`).
- The `windows()` rule for machine predicates (§5.5).
- `hintPlan` names a strong plan.
- Ids are unique across the catalog (`validateCatalog` handles an optional boss and field).

### 5.11 Tests (Act 1's equivalents of Act 2's)

| File | Proves |
|---|---|
| `src/content/act1/act1.test.ts` | The schema parses. `validateAct` and `validateCatalog([act1, act2])` return `[]`. 3-5 directed steps. 5-8 drills, all judgment drills, using at least 3 kinds. Limits of 30-60 s. The Question Round has strong, okay and weak candidates. No command line contains a secret value. |
| `src/content/act1/agent.test.ts` (replaces `sims.test.ts`) | From each step's canonical start (the reference path of earlier steps, plus `before`), for every start plan, under allow-all and deny-harmful, and every plan → fix to depth 2: (1) every line runs with no "doesn't run … yet", "expressions yet" or "not recognized", unless marked `fails`; `fails` lines exit non-zero and the rest exit 0; every line that asks has an `answer`; (2) exactly one check option is true at every end state, and **every option is true at some end state** (no made-up distractors); (3) at least one start plan passes directly, and each step has a slip; (4) the step is not already passing on arrival; (5) looks emit zero events and leave the snapshot unchanged; (6) a pinned table of which gates are harmful, so a drifting guard fails; (7) every end state that misses has a fix that passes from it; (8) every `predict` has exactly one true outcome; (9) the reference path completes the mission in order. |
| `src/content/act1/drills.test.ts` | predict and diagnose: exactly one option true. fix: at least one passes and one fails. approve: harm matches a pinned table, and each mission has at least one allow and one deny answer. order and spot: the rules in §2.1. |
| `src/content/act1/intent.test.ts` (B1) | Every card's own text matches its plan. A paraphrase corpus per plan matches. Vague text matches the weak plan. |
| `src/content/act1/boss.test.ts`, `fieldMission.test.ts` | §3.7, §3.8 |
| `src/content/act1/play.test-helpers.ts` | `laptopShell(setup)`, `playPlan(shell, plan, policy)`, `answerOf(drill)`. Uses `testDeps()` from `src/engine/git/testDeps.ts`. |
| Engine: `driver.test.ts`, `snapshot.test.ts`, `queries.test.ts`, `folderChanged` cases | Count toward the 90% engine coverage |
| Game: `agentRunner.test.ts`, `judgment.test.ts`, `machinePredicates.test.ts`, `replay.test.ts` (replay equals live; a dry run never touches the live sandbox), `effects.test.ts`, `terraceLayout.test.ts`, `ghostLayout.test.ts` | Pure state machines, graders and layouts |
| `tests/e2e/act1.spec.ts` (NEW, one spec, `test.slow()`) | New save → Acts shows "Act 1 · The Machine" → Play 1.1 → Skip briefing → click the full-path card (instant pace under webdriver) → pick "C:\Users\kyle\quillwork\api" → "Confirmed" → Next step → "Step 2 of 4" → zero console problems |

---

## 6. Engine reuse

### 6.1 What the agent uses, and how

| Need | API | Status |
|---|---|---|
| Run a line in the active tab | `new Shell(ws, DISPLAY_ROOT)`; `shell.run(line)` → `ShellResult { lines: OutputLine[{text, tone}], exitCode }`. On a laptop, `Shell.machineShell` is one `MachineShell` per tab (`tabShells`, keyed by `machine.active().id`). | chain 1 (`shell.ts` on `feat/remove-item`) |
| The prompt before each line | `shell.prompt()` → `PS C:\…>`, or the `CHOICES` line while asking | chain 1 |
| Confirm | After `run`, `shell.machineShell.asking === true`. The next `shell.run('A' \| 'L' \| …)` answers and is kept out of history. | chain 1 (`confirm.ts`) |
| Events per action | `const stop = ws.events.on(push)`, run, `stop()`. `Workspace` forwards `machine.events` onto `ws.events`. | main |
| Terminals | `machine.openSession()` (activates, emits `sessionOpened`), `machine.activate(id)`, `machine.sessions()`, `machine.restartTerminals()` | main |
| Otto's file tool, Kyle's human action | `writeSandboxFile(ws, drivePath, content)` (emits `fileChanged`) | main (`src/engine/fixtures.ts`) |
| Setups, `before`, twists, replay | `createSandbox(steps, deps)` / `buildWorkspace`, `applySteps(ws, steps)` | main |
| Grading | `machineQueries(machine)` (A1), `gitQueries(ws)` on the mount | A1 / main |
| Labels, effects text | `display()`, `fromDisplay()`, `toCanonical()` (`winPath.ts`) | main |
| Fidelity | `fixtures/*.txt` captures, checked by `captures.test.ts` | main and chain 1 |

### 6.2 New engine code (pure, with tests, 90%+ coverage)

| PR | Adds |
|---|---|
| A1 | `queries.list`, `queries.tabs` |
| A8 | `folderChanged { path, change: 'created' \| 'deleted' }` MachineEvent from `mkdir`, `New-Item -ItemType Directory`, folder `Remove-Item`, and the `mkdir` fixture op |
| A9 | `driver.ts` |
| A10 | `snapshot.ts` |
| A24 | `queries.home`, each listed item's `hidden` (read without walking the drive per item) |
| D1 | `$env:NAME` read as a statement, `$env:NAME = '…'`, `+= '…'`, `= $null`, `"…$env:Path"` (the lexer already reads variables in double quotes, #117), `Remove-Item Env:NAME` |
| D2 | `setx NAME value` (real `SUCCESS` text; User scope; `/M` denied; open terminals unchanged) |
| D3 | `lookup.ts` (PATH order, PATHEXT, never the current folder), a `program` fixture op (marker files), `node --version` and `npm --version` (captures on main), `Get-Command` (`get-command.txt`) |
| E1 | npm with an offline registry (walks up to the project root, lockfile, `node_modules` markers, E404, ENOENT; `npm-run-missing.txt`) |
| F1-F2 | Processes (`process` and `stop` fixture ops with explicit PIDs), app specs (`PORT`, `DATABASE_URL`, `/health`), busy terminals, `interrupt`, `Get-Process`, `Stop-Process -Id` and `-Name`, `Get-NetTCPConnection -LocalPort` and `-State Listen` (`tcp-listen.txt`, `error-*` captures), `curl.exe` against localhost |

Error handling: the engine must never throw from `Shell.run`. `agent.test.ts` proves every authored line runs. If the driver does throw, `agentPlay` catches it:
- stops Otto with "Otto hit an engine bug"
- logs `console.error('[ship-it] …')`

This matters because `TerminalPanel.tsx` has no try/catch around `shell().run`.

### 6.3 What can wait (no Act 1 line needs it)

- Tab completion in the laptop profile
- Interactive Ctrl+C key handling (Otto uses `interrupt`)
- Pipes, parentheses, `&`, member access
- `[Environment]::`
- winget, pip, venvs
- `where.exe`, `tasklist`, `taskkill`, `netstat` (captured, not needed)
- The Environment Variables editor dialog
- `-WhatIf`, `-ErrorAction` on every cmdlet
- Protecting `C:\Windows`
- Terminal width (NEXT_IDEAS 24)
- Mid-path wildcards (NEXT_IDEAS 27)
- `help` on the laptop

---

## 7. Making Act 1 the starting Act without breaking Act 2

| File | Change | How Act 2 stays safe |
|---|---|---|
| `src/content/index.ts` | `ACTS = [{ act: act1, missions: act1Missions, freePlay }, { act: act2, missions: act2Missions }]` (A27). Before that, A14 wires Act 1 in only behind `?preview=act1`, read in `src/main.tsx`, for the UI verify loop. A27 removes the flag. | `validateCatalog` keeps ids unique |
| `src/game/missions/schema.ts` | Early-access `ActSchema` (A3), `StepSchema.agent`, `approvals` (A6), the drill union (A7), machine kinds (A2) | `act2.test.ts` parses as before |
| `src/game/missions/validateAct.ts` | Optional parts, new texts and budgets, the `windows()` rule | Act 2 still returns `[]` |
| `src/game/missions/runner.ts` | Boss functions use `requireBoss`; `submitAnsweredDrill`; narrowing in `submitDrill` | `runner.test.ts` unchanged |
| `src/game/play/catalog.ts` | `recommendedAct`: the first Act with `!completedAt && hasWorkLeft(save, entry)` (a mission not done, or a boss or field present and not done), else the first Act. `ActContent.freePlay`. | Act 2 is one tab away |
| `src/game/play/saveRules.ts` | `refreshAct` returns early for `earlyAccess`; `completeMission` takes an optional `directingXp` | Act 2 passes nothing |
| `src/game/play/{bossPlay,fieldPlay,seriesPlay}.ts` | `require*` helpers; judgment drills in series | Same flow for Act 2 |
| `src/game/play/missionPlay.ts` | Directed steps go to `agentPlay.ts`; `missionSandboxChanged` returns early for directed sims and judgment drills; `startMission` asks to travel only when `initialRepoState[0].op === 'windows'` | Act 2 route identical, no travel |
| `src/game/play/sandboxControl.ts` | The log (`currentLog`, `recordAction`, `applyChange`, all-or-nothing), `dryRunNow`, `currentQueries(): SandboxQueries` with the transcript, rewind swap (`rewindTo`); `loadSandbox` takes a deps factory | `gitQueries` still the base |
| `src/game/play/freePlay.ts` (NEW) | Laptop free play on the island; the practice project on Git World arrival | Campus unchanged |
| `src/game/worldState.ts` | `ZoneId = 'campus' \| 'machine' \| 'gitworld'`; `requestedZone: ZoneId \| null` | — |
| `src/game/world/zones.ts` | `CAMERA_RIGS.machine`; `ZONE_FOR_ACT = { 1: 'machine', 2: 'gitworld' }`; `openActs(catalogActs)` returns the Acts that are in the catalog **and** have an island | The Act 2 portal is unchanged; `zones.test.ts` updated |
| `src/game/world/world.ts` | Machine entries in `portalsIn` and `zones`, `createMachineWorld`, travel on `requestedZone`, machine sync | Git World code paths untouched; `portalPoint(2)` still works |
| `src/game/world/campus.ts` | A "Start here" `Label` over the recommended open portal | Portal positions unchanged |
| `src/game/world/testHooks.ts` | `portalPoint(1)` works as is | — |
| `src/ui/TitleCard.tsx` | `HINTS` keyed by `ZoneId`. campus: "…step through the glowing Act 1 portal". machine: "Direct Otto from the panel. Watch the terraces." Names `{ campus: 'Campus', machine: 'The Machine', gitworld: 'Git World' }`. | `world.spec.ts` still sees "Git World" |
| `src/game/tutorial.ts`, `TutorialCard.tsx`, `tutorial.test.ts` | Drop the `'command'` step (typing `pwd`). `terminal` text: "The terminal shows what your agent runs. Press Ctrl and ` to hide it, then again to bring it back." `portal`: "…the Act 1 portal, or open Acts." | The save keeps only `completedAt` |
| `src/ui/terminal/TerminalPanel.tsx` | Prints the agent feed (typing animation, dividers). Read-only during Act 1 missions and drills; the first key shows a hint. New `TerminalTabs.tsx` strip on laptops (A19). Neutral `WELCOME` in A27, once a new save starts in Act 1: "SHIP IT terminal. Your agent's commands show up here. Free play: type help." | Typing is unchanged for Act 2 and Campus; `terminal.spec.ts` still types git on Campus |
| `src/ui/play/ActMenu.tsx` | Rows only for parts that exist; "Early access" line; "Coming soon" rows from `upcoming` | Act 2 rows identical |
| `src/ui/play/MissionView.tsx` | `step.agent` → `AgentStepView`; `isJudgmentDrill` → `JudgmentDrillView`; briefing strip from `DIAGRAM_STRIPS[diagram]` (NEW `diagramStrips.ts`); unknown ids fall back to today's Workbench → Loading Dock → Vault strip | Act 2's diagrams (`workbench-dock-vault`, `diff-between-rooms`, `atomic-commits`, `blocklist-sign`, `undo-map`) show the same strip |
| `src/ui/play/SeriesView.tsx`, `useClock.ts` | Judgment drills; the clock also runs while Otto acts | — |
| `src/game/save/*` | **Nothing in Milestone A.** Act key `"1"` is already valid; drills and missions are keyed by id. v3 comes in B5 for pace and best stars. | No migration |
| `tests/e2e/play.spec.ts` | `openAct2` clicks Acts, then the "Act 2" tab, then expects 'Act 2 · Git Core' | Assertions unchanged |
| `tests/e2e/tutorial.spec.ts` | 5 steps, no `pwd` | — |
| `tests/e2e/world.spec.ts` | Adds `portalPoint(1)` → 'The Machine' | The Act 2 test is unchanged |
| `README.md`, `DESIGN.md`, `NEXT_IDEAS.md` | "How to play" starts with Act 1; §9 below; items 5-23 replaced | — |

---

## 8. PR plan

**Every PR follows CLAUDE.md:**
- an issue under epic **#95**
- a branch from an up-to-date `main`
- Conventional Commits
- the PR template with PowerShell "How to test"
- a `LEARNING.md` entry with three review questions
- `npm run check` green
- the verify loop for UI PRs: zero errors and warnings, two differing screenshots, backend noted
- `DESIGN.md` updated when behaviour changes
- `gh pr merge --squash --delete-branch`

Sizes exclude content data, captures and lockfiles.

### P0: docs first

| # | Title | Files | ≈ |
|---|---|---|---|
| P0 | `docs: act 1 directs an in-game coding agent` | `DESIGN.md` (pillars, §4 Otto, §5 loop, §11 Act 1, §15; marked "Act 1: in progress"), `docs/act1-directed.md` (this spec), `NEXT_IDEAS.md` items 5-23 | 250 |

### Chain 1: land the reviewed engine (needed by A8 onward)

**Mechanics**
1. First, `git rebase --onto feat/number-parameters 636600d feat/remove-item --update-refs`, then `git push --force-with-lease`. Feature branches only, never main.
2. After each squash merge: `git switch main; git pull; git rebase --onto main <old tip of the merged branch> feat/remove-item --update-refs`.
3. Split branches at the listed commit boundaries by making a branch at the boundary commit.
4. Apply diffs, never whole files from old snapshots (memory note: split-branch clobber).

| # | PR | Split at | ≈ lines incl. tests |
|---|---|---|---|
| E1 | #118 `feat/powershell-binder` (open) | — | 403 |
| E2 | `feat/binder-hints` | — | 95 |
| E3 | `feat/number-parameters` | — | 91 |
| E4 | `feat: get-location and set-location` | `c5aff12` | 126 |
| E5 | `feat: laptop sandboxes run powershell 7 in the active tab` | through `f0fcf06` | 335 |
| E6 | `fix: wildcard cd, cd.. and cd\, and one powershell per tab` | `40f063a` | 200 |
| E7 | `feat/get-childitem` | — | 294 |
| E8 | `feat: get-childitem with wildcards, recursion, and env:` | through `1d3523d` | 384 |
| E9 | `fix: get-childitem declares all parameters` | `81983a6`, `82757b7` | 126 |
| E10 | `feat: new-item, mkdir, and test-path` | through `74e1fab` | 350 |
| E11 | `fix: new-item refuses a file on the way` | `0d986ca` | 189 |
| E12 | `feat: cmdlets can ask a question the next line answers` | `2c9ff8d`, `a14325e` | 141 |
| E13 | `feat: remove-item with powershell's confirm question` | `dc7894b`, `08c8752` | 319 |
| E14 | `fix: remove-item declares all its parameters, keeps hidden or read-only items` | `72eb323` | 304 |

### Milestone A: Mission 1.1 playable as the starting Act from a new save

**A1-A7 don't need chain 1** and can merge while it lands.
**Critical path**: E14 → A8 → A9 → A10 → A11 → A12/A13 → A14 → A16 → A17 → A20 → A21 → A27. The world track (A23 to A26) runs beside it.

| # | Title | Files | Tests | ≈ |
|---|---|---|---|---|
| A1 | `feat: read-only machine queries for grading` | Cherry-pick `0939145` onto main; add `list`, `tabs` in `src/engine/machine/queries.ts` | `queries.test.ts` | 190 |
| A2 | `feat: grade the laptop by folder, file, location, and variable` | `game/missions/machinePredicates.ts` (from `stash@{0}^3`, plus `tab`, `newTerminal`), `predicates.ts` (`SandboxQueries`, `describe(p, display)`), `schema.ts` (4 kinds), `validateAct.ts` (the `windows()` rule), `play/sandboxControl.ts` (`currentQueries` adds `machine`) | `machinePredicates.test.ts`, `predicates.test.ts`, `schema.test.ts`, `validateAct.test.ts` | 390 |
| A3 | `refactor: an act can ship in early access` | `schema.ts` (`ActSchema`, `require*`), `runner.ts`, `saveRules.ts`, `bossPlay.ts`, `fieldPlay.ts`, `seriesPlay.ts`, `validateAct.ts`, `sample.test-mission.ts` (an early sample) | `schema.test.ts`, `validateAct.test.ts`, `saveRules.test.ts` (an early Act never completes), `play.test.ts`; Act 2 suites unchanged | 300 |
| A4 | `feat: early-access acts in the menu, and a recommendation that moves on` | `ui/play/ActMenu.tsx`, `play/catalog.ts` (`hasWorkLeft`) | `catalog.test.ts` (two-Act sample; new save → 1; 1.1 done → 2) | 180 |
| A5 | `refactor: shared schema pieces move to schemaParts.ts` | `schemaParts.ts` (NEW), `schema.ts` (re-exports). A pure move: review with `git diff --color-moved`. | the existing suite, unchanged | 290 moved |
| A6 | `feat: directed steps in the mission schema` | `agentSchema.ts` (NEW), `schema.ts` (`StepSchema.agent`, `approvals`, `ChangeStepsSchema` for `before` and twists, all-or-none), `validateAct.ts` (texts, budgets) | `agentSchema.test.ts`, `validateAct.test.ts`, Act 2 parse unchanged | 380 |
| A7 | `feat: judgment drills in the mission schema` | `schema.ts` (union, `isJudgmentDrill`), `runner.ts` (`submitAnsweredDrill`, narrowing), `missionPlay.ts` and `seriesPlay.ts` (narrowing), `validateAct.ts`, `content/act2/drills.test.ts` (narrowing) | `schema.test.ts`, `runner.test.ts` | 330 |
| A8 | `feat: folders announce when they're made or removed` | `engine/machine/events.ts`, `shell/machine/cmdlets/items.ts`, `remove.ts`, `machine/fixtures.ts` | `items.test.ts`, `remove.test.ts`, `fixtures.test.ts` | 150 |
| A9 | `feat: a driver runs agent actions through the shell` | `engine/shell/driver.ts` (NEW) | `driver.test.ts`: run, answer, write, newTerminal, useTerminal, events per action, prompt before, answer only while asking | 280 |
| A10 | `feat: machine snapshots and what changed` | `engine/machine/snapshot.ts` (NEW) | `snapshot.test.ts`: a diff table, collapsed folder deletes, names-only env, append vs replace | 260 |
| A11 | `feat: the sandbox log, replays, and dry runs` | `game/agent/{replay,transcript}.ts` (NEW), `play/sandboxControl.ts` (log, `recordAction`, `applyChange`, rewind swap, `SandboxQueries` with transcript) | `replay.test.ts`: replay equals live (`testDeps`), a dry run never touches the live sandbox, harm from guards | 330 |
| A12 | `feat: the agent step state machine` | `game/missions/agentRunner.ts` (NEW) | `agentRunner.test.ts`: every transition, the verdict table, gates, predicts, stop, rewind, stars, `completeAgentStep` advancing exactly one step | 400 |
| A13 | `feat: judgment drills are graded by running them` | `game/missions/judgment.ts` (NEW): predict, diagnose, fix, approve, `shuffleFor` | `judgment.test.ts` on a tiny laptop | 350 |
| A14 | `feat: act 1 mission 1.1 where things live, behind a preview flag` | `content/act1/{shared,whereThingsLive,act,index,play.test-helpers}.ts`, `src/main.tsx` (`?preview=act1`) | `act1.test.ts`, `agent.test.ts`, `drills.test.ts` | tests ≈ 350 plus content |
| A15 | `feat: otto's pace and the agent feed` | `game/agent/{feed,pace,browserMotion}.ts` (NEW) | `feed.test.ts`, `pace.test.ts` (instant under reduced motion or webdriver) | 180 |
| A16 | `feat: otto plays a plan, and kyle checks his claim` | `play/agentPlay.ts` (NEW: begin step, apply `before`, pick, tick, looks, check, result, next step), `missionPlay.ts` (routing, travel request), `playStore.ts`, `play.ts` (tick; Otto's typing is advanced once per drawn frame, not by the 250 ms `tickPlay`, §5.6), `saveRules.completeMission` (`directingXp`), `sample.test-mission.ts` (a directed sample) | `play.test.ts`: a full sample step, verdicts, XP once | 390 |
| A17 | `feat: approval gates, predictions, stop, and rewind in play` | `play/agentPlay.ts`, `game/agent/effects.ts` (NEW: `isConsequential`, `describeChanges`) | `effects.test.ts`, `play.test.ts` (allow, deny, onDeny, Confirm answer, rewind) | 330 |
| A18 | `feat: judgment drills in missions, placement, and reviews` | `missionPlay.ts`, `seriesPlay.ts` (scene playback, clock after the scene, `submitJudgment`) | `play.test.ts`: pass or miss, review queue through `addMiss`, the clock starts after the scene | 300 |
| A19 | `feat: the terminal shows what otto runs` | `ui/terminal/TerminalPanel.tsx`, `ui/terminal/TerminalTabs.tsx` (NEW), `ui/terminal/feedText.ts` (NEW, pure), `ui/terminal/readOnly.ts` (NEW), `game/agent/terminalFeed.ts` (NEW) | `feedText.test.ts`, `readOnly.test.ts`, `TerminalTabs.test.tsx`, `terminalFeed.test.ts`; verify loop | 220 |
| A20 | `feat: directing panels: cards, otto's run, predicts, and gates` | `ui/play/agent/{AgentStepView,PlanCards,RunLog,PredictCard,GateCard,OttoBubble}.tsx`, `ui/play/agent/ottoLines.ts`, `ui/play/diagramStrips.ts`, `MissionView.tsx`, CSS | verify loop with `?preview=act1` | 380 |
| A21 | `feat: directing panels: checking the claim and the step result` | `ui/play/agent/{CheckCard,LookChips,ResultCard,AnatomyChips,Stars}.tsx`, the Done screen in `MissionView.tsx` | verify loop | 330 |
| A22 | `feat: judgment drill cards` | `ui/play/JudgmentDrillView.tsx` (predict, diagnose, fix, approve), `MissionView.tsx`, `SeriesView.tsx` | verify loop | 350 |
| A23 | `feat: the machine island, its portal, and free play on the laptop` | `worldState.ts`, `world/zones.ts`, `world/world.ts`, `world/machine/machineWorld.ts` (NEW), `world/campus.ts` ("Start here"), `ui/TitleCard.tsx`, `play/freePlay.ts` (NEW), `play/catalog.ts` (`freePlay`) | `zones.test.ts`, `freePlay` unit test; verify loop | 380 |
| A24 | `feat: terrace layout follows the laptop` | `world/machine/terraceLayout.ts` (NEW, pure), `engine/machine/queries.ts` (`home`, `hidden`) | `terraceLayout.test.ts` (caps, determinism, lantern tiles, focus), `queries.test.ts` | 260 |
| A25 | `feat: folder terraces, lanterns, and otto's drone` | `world/machine/{terraces,lanterns,ottoDrone}.ts` (NEW), `world.ts` (machine sync, event queue, pulses) | verify loop (two differing screenshots) | 380 |
| A26 | `feat: ghost tiles and the blast radius` | `world/machine/{ghostLayout,ghosts}.ts` (NEW), gate and predict wiring through the feed | `ghostLayout.test.ts`; verify loop | 300 |
| A27 | `feat: act 1 is the starting act` | `content/index.ts` (Act 1 first; flag removed), `main.tsx`, `ui/terminal/TerminalPanel.tsx` (neutral `WELCOME`), `tutorial.ts`, `TutorialCard.tsx`, `tutorial.test.ts`, `tests/e2e/{play,tutorial,world}.spec.ts`, `tests/e2e/act1.spec.ts` (NEW), `README.md`, `DESIGN.md` §4, §5, §11, §15 | `catalog.test.ts`; e2e | 300 |

**Milestone A result:** a new save starts in Act 1. Mission 1.1 plays end to end, offline, with its world, ghosts, drills and Question Round. Act 2 plays as before.

### Milestone B: free text, Sage, the first Field Mission, chain 2, Mission 1.2

| # | Title | ≈ |
|---|---|---|
| B1 | `feat: tell otto in your own words` (`anatomy.ts`, `intent.ts`, Say-it-your-way box, plan-mode echo; `intent.test.ts`) | 350 |
| B2 | `feat: sage reads plain-english directions` (`server/protocol.ts` mode `interpret_plan`, `server/prompts/interpret_plan.md`, `prompts.ts` `PromptMode`, `mentor.ts`, `app.ts`, `src/mentor/client.ts` `interpretPlan`; drill guard; tests) | 350 |
| B3 | `feat: sage hints know otto's terminal, names only` (hint `agent` context, `game/agent/redact.ts`, `askForHint` for directed steps, `hint.md`) | 250 |
| B4 | `feat: act 1 field mission brief your real agent, first checks` (existing parsers) | 150 plus content |
| B5 | `feat: otto's pace and best stars are saved (save v3)` (`save/schema.ts` v3, `migrations.ts` `addAgentPaceAndStars`, `SettingsPanel`, ActMenu stars) | 250 |
| B6-B10 | Chain 2. First push the rebased local chain; the origin copies are stale. Then rebase `--onto main 72eb323 feat/redirects --update-refs`, dropping `0939145` (A1 has it). Order: `drive-move` (split `f43d385`+`aa8c07b` ≈156 / `247d916` by file group ≈441), `copy-move-rename` (≈343), `content-cmdlets` (≈289), `redirects` (≈214). Before B6, recheck the chain-2 fidelity findings (the chain-2 review: FsError escapes, move-before-check). | as built |
| B11 | `feat: order and spot drills` (schema, `judgment.ts`, cards) | 380 |
| B12 | `feat: otto's file tool with a diff on the gate` (write gating, pure `lineDiff`, `GateCard` diff) | 300 |
| B13 | `feat: deletes dissolve, overwrites flip, moves slide, and look chips from the world` (world animations, the recycle bin, `machineSuggestions.ts` read-only looks) | 350 |
| B14 | `feat: act 1 mission 1.2 deletes are forever` | tests 300 plus content |

### Milestone C: Mission 1.3 Secrets Stay Home

| # | Title | ≈ |
|---|---|---|
| C1 | `feat: secret checks, the human action, and otto's questions` (`dotenv` and `secretShown` predicates, `human`, `ask`, `paste`, `secrets` refs) | 380 |
| C2 | `feat: the fence and otto's memory cloud` (world) | 350 |
| C3 | `feat: act 1 mission 1.3 secrets stay home` | tests 300 plus content |

### Milestone D: Mission 1.4 Every Terminal Is Its Own World

| # | Title | ≈ |
|---|---|---|
| D1 | `feat: environment variable statements in the laptop shell` (plus captures) | 380 |
| D2 | `feat: setx saves for new terminals` | 200 |
| D3 | `feat: program lookup, get-command, and versions` (`program` op) | 400 |
| D4 | `feat: commandResolves` | 150 |
| D5 | `feat: lantern notes and the corkboard` | 380 |
| D6 | `feat: path lamps and the scout drone` | 300 |
| D7 | `feat: act 1 mission 1.4 every terminal is its own world` | tests plus content |

### Milestone E: Mission 1.5 Dependencies Are Declared

| # | Title | ≈ |
|---|---|---|
| E1 | `feat: npm install against an offline registry` | 400 |
| E2 | `feat: npm scripts, -g, and --save-dev` | 300 |
| E3 | `feat: packageInstalled and the supply depot` | 380 |
| E4 | `feat: act 1 mission 1.5 dependencies are declared` | tests plus content |

### Milestone F: Mission 1.6 Running Isn't Working

| # | Title | ≈ |
|---|---|---|
| F1 | `feat: processes, apps, busy terminals, and interrupt` (`process` and `stop` ops, pinned PIDs) | 400 |
| F2 | `feat: get-process, stop-process, get-nettcpconnection, and curl` | 380 |
| F3 | `feat: process, port, and http checks` | 300 |
| F4 | `feat: engine room and patch panel, with otto as a process` | 400 |
| F5 | `feat: act 1 mission 1.6 running isn't working` | tests plus content |

### Milestone G: the full Act

| # | Title | ≈ |
|---|---|---|
| G1 | `feat: agent bosses with a symptom loop` (`BossSchema.agent`: probe, deck, suggestions, symptoms; `bossPlay`; `BossView` deck and recap; `ChangeStepsSchema` twists) | 400 |
| G2 | `feat: act 1 boss works on my machine and the symptom board` | 350 |
| G3 | `feat: field parsers for runtimes and listening ports` | 350 |
| G4 | `feat: field parsers for env names and the agent brief, with the secret guard` | 380 |
| G5 | `feat: act 1 field mission checks the brief itself` | 150 |
| G6 | `feat: act 1 placement test, and act 1 leaves early access` (12 drill ids, `earlyAccess: false`, DESIGN §11 and §15) | 150 |
| G7 | `feat: sage explains a miss after it ends` (`explain` mode) | 300 |

---

## 9. DESIGN.md changes and risks

### 9.1 DESIGN.md

| Section | Change (P0 sets the direction; each PR keeps it current) |
|---|---|
| Header, §1 | v1.1. "…a software-engineering course for the era of directing AI coding agents." |
| §3 P2 | **Two-way mapping:** every agent action shows its real command and output, and every command animates the world. A world click offers a command (Act 2) or a read-only look (Act 1). |
| §3 P3 | Add: "Checks of understanding are graded by state too: an answer is right when the engine says its claim is true." |
| §3 P4 | **Drills are real:** mentor off, no hints, timed. Directed Acts use judgment drills (predict, diagnose, fix, order, approve, spot) with no typing and engine-computed answer keys. Typed Acts keep No-AI command drills. |
| §3 new P9 | **Direct, then check:** Kyle plans, approves and verifies; the agent types. Typing is never required in directed Acts. The agent is scripted content, never an LLM. |
| §4 | Cast: Otto (scripted coding agent, magenta drone). Hub: Act 1 is the starting portal. A new "Machine visual language" table (§4 above). Tutorial: 5 steps, no typing. |
| §5 | The directed step loop (Direct → Run with predicts and gates → Check → Result, fixes and rewind), verdicts, stars, approval modes, judgment drill formats, "the clock starts after the scene", early-access Acts |
| §6 | Stars at 2 XP each; best stars and Otto's pace saved in v3 |
| §7 | Driver, snapshots, `folderChanged`, "the content is the spec for the engine" (`agent.test.ts`), the engine scope limits of D13 |
| §8 | Act 1 row: "Brief Your Real Agent" (SandCastles) |
| §9 | `interpret_plan`; hint machine context (names only); `explain` after misses |
| §10 | Plans, agent tasks, judgment drills, `earlyAccess`, `approvals` |
| §11 Act 1 | The six principle missions, the boss as a symptom loop. Act 2 note: "converts to directed later; the driver already runs Act 2's shell." |
| §13 | `engine/shell/driver.ts`, `engine/machine/snapshot.ts`, `game/agent/`, `game/world/machine/` |
| §14 | The terminal is read-only while Otto drives. Reduced motion makes his typing instant. |
| §15 | M2: "Act 1 (directed, early access first), then Act 3" |

### 9.2 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Cards become guessing ("pick the longest") | Card lengths vary (a strong card is sometimes short). Consequences play out in the world. Anatomy and quality are shown only afterwards. Grading is by state. Drills use other formats. Shuffles are seeded. |
| Check questions get repetitive or have made-up options | Every option must be true on some reachable path (tested). Questions vary: where, which terminals, is it working, will git share it. Looks make checking about evidence. |
| Too many beats per step | Four stages. Predicts and gates only where the content or the diff calls for them. `destructive` mode by default. Instant pace and Stop. |
| Scaffolding gives answers away | Effects are worked out (not written by an author) and only shown in missions. Predicts come before the ghost. Drills have no effects list, ghost or looks. |
| Authoring blows up | 2-3 start plans and 1-3 fixes per step. `before` normalises the start. `agent.test.ts` proves every path, so a wrong intent fails CI. |
| Engine scope creep | D13 plus `agent.test.ts`: only authored lines must run. Cut order if short of time: order and spot drills, then lamps, then the npm `-g` shelf. |
| Dry runs drift from live | Deterministic engine; replay parity tests with `testDeps`. The live log keeps a deps factory, so every dry run, rewind and `applyChange` trial replays on a fresh clock and never moves the live one. On the real clock those replays' commits get new times and ids; nothing grades by commit id. |
| Act 2 regressions | Additive schemas (sandbox drills are unchanged, the Act 2 runner is untouched, `SandboxQueries` extends `GitQueries`). No auto-travel. Act 2 suites must pass unchanged in every PR. e2e changes are limited to `openAct2` and the tutorial. |
| Early access keeps pointing the Acts button at Act 1 | `hasWorkLeft` moves the recommendation to Act 2 once 1.x is done. No placement test while in early access. |
| Stacked-branch merge mistakes | One PR at a time, `--update-refs`, split only at commit boundaries, apply diffs (memory note). Push chain 2 only after rebasing; recheck its fidelity findings before B6. |
| The stash drifts from main | A2 reapplies it as diffs onto post-A1 main; tests are written fresh. |
| An engine throw freezes the terminal | Content tests prove authored lines run. `agentPlay` catches and logs a throw. Chain 2's FsError findings get fixed before B6. |
| Secrets | Fake values only (gitleaks). Events and `MachineChange` carry names only. `redact.ts` runs before Sage. `.env` contents never leave the game. Field pastes go through the secret guard. |
| No mid-mission resume (true of Act 2 today) | Accepted for the slice. The log makes a replay-based resume a small later PR (see Open questions). |
| CI e2e budget (software rendering) | One new `act1.spec.ts` marked `test.slow()`. World visuals are checked in the local verify loop. |
| World clutter or fps | Caps (40 tiles, 24 cards, 6 lanterns). Districts dim until their mission starts. `motion` factor. `machineDirty` at most once per frame. |

---

## Decisions Kyle already made

1. The game fits the vibe-code era: less terminal, more understanding of the principles.
2. In missions Kyle **directs an in-game AI coding agent**: he picks a plan or writes one in plain English, the agent runs the commands, and the world shows what changed. Kyle plans, checks the result and catches the agent's mistakes. The terminal is for reading; typing is never required.
3. Typed No-AI drills become **predict-and-diagnose drills**: short, timed, mentor off, no hints, graded, and fed into the review queue. No typing.
4. Act 1 is built in this style **first** and is **the starting Act from a new save**. Act 2 stays as it is and converts later.
5. The shell engine stays **behind the agent**: its commands really run through it, produce real PowerShell output and errors, and animate the world.
6. The hard constraints:
   - fully playable without an Anthropic key (authored plans, scripts and slips; Sage only adds free-text understanding)
   - graded by predicates, never exact strings
   - missions as zod-validated data in `src/content`
   - `engine/` pure at 90%+ coverage
   - ≤ ~60 words on screen with a visual for every concept
   - PRs under ~400 lines
   - progress in IndexedDB
   - Act 2 unchanged

## Open questions

1. **From the "permission" design.** It proposed an optional Field Mission step where Kyle adds `.env` read-deny rules to SandCastles' `.claude/settings.json`. This spec leaves it out.
   - Should it be included as an optional checklist item Kyle does himself?
   - If yes, the rule syntax must first be checked against current Claude Code docs. No agent should make that change for him.
2. **Resuming a mission partway through.** Directed steps take longer than Act 2's typed ones, and today a reload restarts the mission (Act 2 behaves the same).
   - Should a resume move up into Milestone B, alongside save v3 in B5? It would store the chosen plan ids and the sandbox log per step.
   - Or should it stay a later PR?

Defaults until Kyle says otherwise: (1) the settings rule stays out of the Field Mission; (2) resuming a mission partway through stays a later PR.
