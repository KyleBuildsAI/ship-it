# LEARNING

Every PR in this repo ends with three "can you answer these?" questions. They are collected here, newest last, so you can study them later. Try to answer each one out loud before you open the answers, then read the PR's "Concepts" section if you missed one.

---

## #14 chore: project tooling and HUD shell

https://github.com/KyleBuildsAI/ship-it/pull/14

1. Why does `vite.config.ts` use `/ship-it/` for build and preview but `/` for dev? What would you see on the Pages site if the base were wrong?
2. `npm run check` chains its steps with `&&`. What happens if lint fails? Why is that order (lint and format first, build last) a sensible one?
3. Name one bug that type-aware linting catches but `tsc` alone lets through, and explain why it's dangerous in a game that has to `await renderer.init()`.

<details><summary>Answers</summary>

1. GitHub Pages serves this repo under the `/ship-it/` path, so the built `index.html` has to request `/ship-it/assets/...`. With the wrong base, the HTML loads but every script and stylesheet 404s, and you get a blank page. `vite preview` serves that same build, so it needs the same base. Dev uses `/` so you can just open `localhost:5173`.
2. `&&` only runs the next command if the previous one succeeded, so a lint failure stops everything and the whole command reports failure. The cheap, fast checks go first so you learn about a problem in seconds instead of after a full build.
3. A floating Promise: calling an async function without `await` or `.catch()`. It compiles fine, but errors inside disappear silently and later code runs before the work finishes. An un-awaited `renderer.init()` can render a frame before the GPU device exists. `@typescript-eslint/no-floating-promises` flags it.

</details>

---

## #16 docs: autonomous PR workflow and LEARNING.md

https://github.com/KyleBuildsAI/ship-it/pull/16

1. What's the difference between a squash merge and a regular merge commit? What does `main`'s history look like with each?
2. Why is "never merge a PR with failing checks" only a real guarantee once CI exists, and what fills that gap until then?
3. Why does the rule say to open an issue after 3 failed attempts instead of retrying until it works?

<details><summary>Answers</summary>

1. A regular merge keeps every commit from the branch and adds a merge commit with two parents, so `main` shows all the small steps. A squash merge combines the branch into one new commit with one parent, so `main` shows one commit per PR. The individual commits remain readable in the PR on GitHub.
2. With no CI, the PR reports no checks at all, so there's nothing to fail and nothing to stop a bad merge. Until CI exists, the gap is filled by running `npm run check` locally before merging. Once #12 lands, GitHub runs the same gates on every push, independently of the author's machine.
3. Retrying the same thing rarely fixes it and burns time on one blocker while everything else waits. An issue records what failed and what was tried, so a person (or a later session) can pick it up with context. Meanwhile the rest of the milestone keeps moving.

</details>

---

## #17 feat: dev status badge with Vitest unit tests

https://github.com/KyleBuildsAI/ship-it/pull/17

1. The store test uses both `toBe` and `toEqual`. What's the difference, and why does the "nothing changed" test need `toBe`?
2. Why is `statusRows()` a separate pure function instead of doing the mapping inside `StatusBadge`?
3. What does `vi.fn()` give you that a normal function doesn't, and which test would be impossible to write without it?

<details><summary>Answers</summary>

1. `toEqual` compares contents: two different objects holding the same data pass. `toBe` compares identity: it passes only if both sides are the same object in memory. React re-renders when `get()` returns a different object, so "nothing changed" must mean the same object comes back. Only `toBe` proves that.
2. A pure function (same input, same output, no side effects) can be tested with plain inputs and outputs, with no React, DOM, or rendering involved. It also keeps display logic (labels, tones) in one place, and the component stays a thin renderer.
3. `vi.fn()` is a spy: it records every call and its arguments. That lets you assert the listener ran exactly once, or never. The tests "stays quiet when the patch changes nothing" and "stops notifying after unsubscribe" both check that something did *not* happen, and that's impossible to observe without a spy.

</details>

---

## #18 chore: Playwright smoke test, CI with gitleaks, and Pages deploy

https://github.com/KyleBuildsAI/ship-it/pull/18

1. CI runs `npm ci`, not `npm install`. What's the difference, and why does it matter on a CI server?
2. Why does the deploy workflow trigger on `workflow_run` of CI instead of simply `push` to `main`, and why does it check out `head_sha`?
3. The gitleaks job checks out with `fetch-depth: 0`. What would it miss with the default shallow checkout?

<details><summary>Answers</summary>

1. `npm ci` installs exactly the versions in `package-lock.json`, deletes any existing `node_modules` first, and fails if `package.json` and the lockfile disagree. `npm install` may resolve newer versions within the allowed ranges and rewrite the lockfile. CI must test exactly what was committed, or a green build proves nothing about your code.
2. With `push`, deploy and CI would run at the same time, and a broken commit could go live before CI finished. `workflow_run` waits for CI to complete, and the job only runs if it succeeded. `head_sha` pins the deploy to the commit CI tested. If `main` moved on in the meantime, the untested newer commit doesn't slip out.
3. The default checkout fetches only the latest commit. A secret that was committed and then deleted in a later commit is still in the history, so anyone can recover it. The full history (`fetch-depth: 0`) lets gitleaks scan every commit ever made.

</details>

---

## #19 feat: three.js render boot with WebGPU/WebGL2 fallback and post stack

https://github.com/KyleBuildsAI/ship-it/pull/19

1. Why must `await renderer.init()` finish before the first `render()` call, and what would you see if it didn't?
2. `vite.config.ts` aliases `'three'` to `'three/webgpu'`. What goes wrong without that alias?
3. `post.ts` wraps both building and running the post stack in `try/catch`. Why catch in both places, and what does the player see if bloom fails?

<details><summary>Answers</summary>

1. `init()` asks the browser for a GPU device (WebGPU) or a WebGL2 context, and sets up the backend. Until that finishes there's nothing to draw with. Rendering early does nothing, or throws, so you'd get a blank or black first frame, possibly with an error in the console.
2. The addons import `'three'`, which normally resolves to the classic core, while our code imports `'three/webgpu'`. The bundle would then contain two separate copies of three.js. It gets bigger, and objects created by one copy fail `instanceof` checks in the other, which causes subtle bugs, like controls or nodes not recognising our camera.
3. Building the node graph can fail up front, for example with an unsupported node. Rendering can fail later, on the first frame when shaders compile on this particular GPU. Catching in both places covers both. Either way it logs one warning and switches permanently to `renderer.render(scene, camera)`, so the player sees the scene without glow or vignette, not a black screen.

</details>

---

## #29 feat: engine purity guardrails and in-memory filesystem

https://github.com/KyleBuildsAI/ship-it/pull/29

1. Engine files are included in both `tsconfig.app.json` (with DOM types) and `tsconfig.engine.json` (without). Why does the second one catch mistakes the first can't?
2. `resolvePath('src', '../../etc/passwd')` returns `null`. What could go wrong if it returned `'etc/passwd'` instead?
3. `VirtualFs` tracks directories separately from files. Which shell command would behave wrongly if directories only existed as "folders that contain files"?

<details><summary>Answers</summary>

1. Typechecking with DOM types means `document`, `window`, and `fetch` all look valid, so engine code could quietly start depending on the browser. With only ES2023 types, any browser API is an unknown name and compilation fails. The same file gets checked twice, once with rules strict enough to protect the engine's purity.
2. The sandbox would pretend there are files outside the project root. Worse, a path that escapes the root could become a way to reach or overwrite things the game never meant to expose. Refusing to go above the root keeps every path inside the project, the same idea as blocking "path traversal" attacks in real servers.
3. `mkdir docs` followed by `ls`. If directories existed only as parents of files, an empty folder would vanish the moment it was created, `ls` wouldn't show it, and `cd docs` would fail. Git itself doesn't track empty folders, but the filesystem, and the shell on top of it, must.

</details>

---

## #30 feat: engine object ids, event emitter, and .gitignore matcher

https://github.com/KyleBuildsAI/ship-it/pull/30

1. Why does `blobId` hash `"blob <size>\0" + content` instead of just the content?
2. Given `.env*` followed by `!.env.example`, which of `.env`, `.env.local`, and `.env.example` get ignored, and why does rule order matter?
3. `Emitter.emit` loops over a *copy* of the listener set. What bug does that prevent?

<details><summary>Answers</summary>

1. Git stores several kinds of objects (blobs, trees, commits) in one database. The header records the object's type and size, so two different kinds of object with the same bytes can never share an id. Matching the header exactly is also what makes our ids identical to real git's.
2. `.env` and `.env.local` are ignored. `.env.example` isn't, because the later `!` rule matches it and the last matching rule wins. With the two lines swapped, `.env*` would come last and ignore `.env.example` again.
3. If a listener unsubscribes while the loop is running, deleting from the set being looped over can make the loop skip the next listener. Looping over a copy means every listener subscribed when `emit` started gets the event exactly once. There's a test for exactly this case.

</details>

---

## #31 feat: engine repository model and revision parsing

https://github.com/KyleBuildsAI/ship-it/pull/31

1. Two commits have the same files and message but were made one minute apart. Do they get the same id? Why does that matter for the tests?
2. What's the difference between `HEAD~2` and `HEAD^2`?
3. After a commit on a detached HEAD, which branch moved, and how would you find that commit again later?

<details><summary>Answers</summary>

1. No. The timestamp is part of what gets hashed, so the ids differ. That's why tests inject a fixed clock (`testDeps`): with the same starting time and the same steps, every run makes the exact same ids, so tests can assert on them.
2. `HEAD~2` walks back two generations along first parents (the grandparent). `HEAD^2` picks HEAD's *second parent*, which only exists when HEAD is a merge commit. On an ordinary commit, `HEAD^2` is an error (`no-such-parent`).
3. None. On a detached HEAD, `commitIndex` moves only HEAD itself, and every branch stays where it was. The commit is still recorded in the reflog, so `git reflog` shows it, and `HEAD@{N}` or its id can bring it back.

</details>

---

## #32 feat: engine workspace and status computation

https://github.com/KyleBuildsAI/ship-it/pull/32

1. A file shows under both "Changes to be committed" and "Changes not staged for commit". How did it get into that state, and which version will `git commit` record?
2. You committed `.env`, then added `.env` to `.gitignore`. Does git now ignore it? What does the test in `status.test.ts` show?
3. Why does `computeStatus` rename detection require the content to be *identical*?

<details><summary>Answers</summary>

1. You changed the file and staged it (`git add`), then edited it again without staging the new edit. `git commit` records the **staged** version (the index), not what's on disk now. The newer edit stays unstaged.
2. No. `.gitignore` only affects untracked files. The test "keeps showing a tracked file even when a rule would ignore it" proves the file still appears as modified. To stop tracking it you need `git rm --cached .env`, which is Mission 2.4.
3. Git infers renames by comparing content, because it never records "I renamed this". Identical content (the same blob id) is a certain match. Real git also allows *similar* content above a threshold, which is harder to explain and to test. The sandbox starts with the exact case, which is what `git mv` produces.

</details>

---

## #33 feat: engine grading queries and fixture builder

https://github.com/KyleBuildsAI/ship-it/pull/33

1. Why does `fixtures.ts` store setup steps as plain objects instead of just calling engine functions directly?
2. A drill says "commit your work but leave `.env` untracked." Which queries would grade it, and why does this accept both `git add app.ts` and `git add .` (with `.env` in `.gitignore`)?
3. What would break if `FixtureBuilder` methods changed `this.steps` in place instead of returning a new builder?

<details><summary>Answers</summary>

1. Plain data can be validated by a schema, saved to a file, printed, and replayed later into an identical sandbox. A chain of function calls can only be run. Missions need to *describe* their starting state, not just produce it once.
2. `untrackedPaths()` (or `ignoredPaths()`) contains `.env`, and `log()` shows a new commit containing `app.ts` (checked with `fileAt('HEAD', 'app.ts')`). Both commands end in that same state, and grading only looks at the state, so both pass.
3. A shared base like `const base = repo().commit('init', files)` would be changed by every drill that extended it. The second drill would silently inherit the first drill's edits, and tests would depend on the order they ran in. Returning new builders keeps each setup independent.

</details>

---

## #34 feat: git CLI plumbing, command router, and git init

https://github.com/KyleBuildsAI/ship-it/pull/34

1. What does `-am "fix: typo"` expand to, and why does the parser stop reading letters after it hits `m`?
2. Why does `git add "*.ts"` in PowerShell reach git as a literal `*.ts`, and which files does it match?
3. The engine returns lines tagged `staged` or `error` instead of colored text. Name one benefit.

<details><summary>Answers</summary>

1. `-a -m "fix: typo"`. `m` takes a value, so whatever follows it (the rest of the same word, or the next word) is the message, and no more letters can be flags. That's why `-ma` would mean "message is `a`", not `-m -a`.
2. PowerShell doesn't expand wildcards for programs like git, so git receives `*.ts` and expands it itself as a pathspec. Git's pathspec `*` also crosses folders, so it matches `app.ts`, `src/app.ts`, and `src/lib/util.ts`.
3. The engine stays free of display concerns and can be tested with plain strings. The terminal can then choose, and later change, colors (or support a high-contrast mode) without touching git logic. Mission verification can also read the plain text.

</details>

---

## #35 feat: git status in long and short formats

https://github.com/KyleBuildsAI/ship-it/pull/35

1. In `git status -s`, what do `MM app.ts`, ` M b.ts`, and `?? notes/` each mean?
2. Why does git show a new folder as `src/` instead of listing its files, and when does it stop doing that?
3. Before your first commit, why does `git status` suggest `git rm --cached` to unstage instead of `git restore --staged`?

<details><summary>Answers</summary>

1. `MM`: a change is staged *and* the file was edited again after staging. ` M` (space, then M): modified but not staged. `??`: untracked. For `notes/`, the whole folder is untracked.
2. Listing hundreds of files from, say, a new `node_modules/` would bury everything else. While git tracks nothing inside the folder, one line is enough. Once any file in it is tracked, git lists the untracked files individually.
3. `git restore --staged` resets the index entry to HEAD's version, but before the first commit there is no HEAD. `git rm --cached` removes the entry from the index directly, which works without any commit.

</details>

---

## #36 feat: git add and git restore

https://github.com/KyleBuildsAI/ship-it/pull/36

1. You run `git add .` inside `src/`. Does it stage a change to `README.md` at the project root? What about `git add -A`?
2. What's the difference between `git restore app.ts` and `git restore --staged app.ts`? Which one can lose work?
3. `git add notes.md .env` with `.env` ignored: what gets staged, and what's the exit code?

<details><summary>Answers</summary>

1. `git add .` from `src/` covers only `src/` and below, so `README.md` isn't staged. `git add -A` without paths covers the whole project from anywhere, so it is.
2. `git restore app.ts` overwrites your working file with the staged version, throwing away unstaged edits, and that *can* lose work. `git restore --staged app.ts` only moves the Loading Dock entry back to HEAD's version, and your file on disk is untouched.
3. `notes.md` is staged and `.env` isn't. Git prints the "paths are ignored" message and exits with code 1. It still stages the paths it could, but the non-zero code warns you (and any script) that not everything happened.

</details>

---

## #37 feat: git rm and git mv

https://github.com/KyleBuildsAI/ship-it/pull/37

1. You committed `.env` by mistake. Which command stops tracking it while keeping it on your machine, and what else must you do to keep it out of future commits?
2. Why does `git rm app.ts` refuse when `app.ts` has unstaged edits, and what are your two ways forward?
3. After `git mv old.ts new.ts`, what does `git status` show, and how is that different from renaming the file in Explorer?

<details><summary>Answers</summary>

1. `git rm --cached .env`, then add `.env` to `.gitignore` so it isn't picked up again by `git add .`. Commit both. If it held a real secret, rotate the secret, because the old commit still contains it.
2. Deleting would destroy edits that exist only on disk, in no commit and not on the Loading Dock. Either `git rm --cached app.ts` (stop tracking, keep the edited file) or `git rm -f app.ts` (delete anyway, deliberately losing the edits).
3. It shows one staged change, `renamed: old.ts -> new.ts`. Renaming in Explorer changes only the disk, so status shows `deleted: old.ts` (unstaged) plus an untracked `new.ts` until you stage both. After staging, git detects the same rename.

</details>

---

## #38 feat: line diff algorithm and git diff

https://github.com/KyleBuildsAI/ship-it/pull/38

1. You staged a change to `app.ts`. Does `git diff` show it? Which command does?
2. What does the hunk header `@@ -1,3 +1,4 @@` tell you?
3. Why does the diff show `\ No newline at end of file`, and why does it matter?

<details><summary>Answers</summary>

1. No. `git diff` compares the staged version with your working file, and they match now. `git diff --staged` (or `--cached`) compares the last commit with the staged version, so it shows the change.
2. The hunk starts at line 1 in both versions. It covers 3 lines of the old file and 4 lines of the new file, so the net change is one extra line.
3. The last line of the file has no newline character after it. That counts as a real difference: adding a line later then shows a change to the *previous* line too, and some tools misbehave. Most editors add the final newline automatically.

</details>

---

## #39 feat: git commit

https://github.com/KyleBuildsAI/ship-it/pull/39

1. You edited `a.ts` and created `new.ts`, then ran `git commit -am "wip"`. What's in the commit, and what's left over?
2. What does `git commit -m "feat: add login" -m "Uses the session API so tokens refresh."` produce as the message?
3. Why does `git commit` with nothing staged fail instead of making an empty commit?

<details><summary>Answers</summary>

1. The commit has the edit to `a.ts` (it's tracked, so `-a` staged it). `new.ts` is left untracked, because `-a` never stages new files. You'd need `git add new.ts` first.
2. A two-paragraph message: the subject line `feat: add login`, a blank line, then the body `Uses the session API so tokens refresh.`.
3. An empty commit is almost always a mistake (you forgot to `git add`), and it would add noise to history. Git refuses, prints the status so you can see what isn't staged, and requires `--allow-empty` if you really mean it.

</details>

---

## #40 feat: git log and git show

https://github.com/KyleBuildsAI/ship-it/pull/40

1. In `git log --oneline`, what does `(HEAD -> main)` next to a commit mean?
2. How would you see only the last 3 commits that changed `src/app.ts`?
3. What's the difference between `git show HEAD~1` and `git show HEAD~1:app.ts`?

<details><summary>Answers</summary>

1. The branch `main` points at this commit, and HEAD is attached to `main`. So this is where you are, and your next commit will move `main` forward from here.
2. `git log -n 3 -- src/app.ts` (or `git log -3 --oneline -- src/app.ts` for one line each).
3. `git show HEAD~1` prints that commit's header and the diff it introduced. `git show HEAD~1:app.ts` prints the full content of `app.ts` as it was at that commit, with no header and no diff.

</details>

---

## #41 feat: git reset and git reflog

https://github.com/KyleBuildsAI/ship-it/pull/41

1. After `git reset --soft HEAD~1`, where are the changes from the undone commit? And after `--mixed`? And after `--hard`?
2. You ran `git reset --hard HEAD~2` and regret it. How do you get the commits back, and why does that work?
3. Why is `git reset` on commits you've already pushed a bad idea, even though it works locally?

<details><summary>Answers</summary>

1. `--soft`: staged (on the Loading Dock), ready to commit again. `--mixed`: in your working files but unstaged. `--hard`: gone from both, and only the reflog remembers the commit.
2. Run `git reflog` to find the entry from before the reset (for example `HEAD@{1}`), then `git reset --hard HEAD@{1}`. It works because reset only moved the branch pointer: the commit objects still exist, and the reflog still points at them.
3. Other people's copies still contain those commits. Rewriting your branch makes it disagree with theirs, and your next push is rejected or forces them into messy fixes. For shared history, `git revert` adds an undo commit instead of removing anything.

</details>

---

## #42 feat: git revert

https://github.com/KyleBuildsAI/ship-it/pull/42

1. A bad commit is already on `main`, which everyone has pulled. Why use `git revert` instead of `git reset`?
2. After `git revert HEAD`, how many commits does `git log` show compared with before, and what does the new commit contain?
3. Why can't the sandbox revert an old commit if the same file changed in a later commit?

<details><summary>Answers</summary>

1. `git reset` would rewrite `main` so the bad commit disappears, but everyone else still has it, so their copies and the shared branch would disagree. `git revert` adds a new commit that undoes the change, so everyone's history stays consistent and they just pull the fix.
2. One more commit than before. The new commit contains the exact opposite of the reverted commit's changes, with the message `Revert "<original subject>"` and a note naming the original commit's id.
3. Undoing the old change means combining it with the newer edit to the same file. If they touch the same lines, git can't decide on its own, and that's a conflict. Resolving conflicts is taught with merges in Act 3, so for now the sandbox stops and explains instead of leaving a half-finished state.

</details>

---

## #43 feat: sandbox shell with PowerShell-style commands

https://github.com/KyleBuildsAI/ship-it/pull/43

1. Why does `git commit -m "fix: login bug"` need the quotes? What would git receive without them?
2. What's the difference between `echo ".env" > .gitignore` and `echo ".env" >> .gitignore`?
3. `ls` doesn't show `.git`, but `ls -Force` does. What is `.git`, and why is it hidden?

<details><summary>Answers</summary>

1. Without quotes the shell splits on spaces, so git receives `-m`, `fix:`, `login`, and `bug` as four separate arguments. The message becomes just `fix:`, and git then tries to treat `login` and `bug` as file paths. Quotes make the whole message one word.
2. `>` replaces the file's contents, so any existing rules are wiped out. `>>` appends a new line and keeps what was there. When adding a rule to an existing `.gitignore`, you almost always want `>>`.
3. `.git` is the repository: every commit, branch, and the staging area live inside it. It's hidden because you should never edit it by hand, and deleting it deletes the project's whole history. `-Force` shows hidden items.

</details>

---

## #44 feat: in-game terminal with line editing and tab completion

https://github.com/KyleBuildsAI/ship-it/pull/44

1. xterm.js already shows a blinking cursor. Why does the game still need its own `LineEditor`?
2. How does the terminal make `git status` output green and red without the engine knowing anything about colors?
3. Why does hiding the terminal use `inert` instead of just `aria-hidden`?

<details><summary>Answers</summary>

1. xterm.js is only an emulator: it draws characters and reports raw keystrokes (`\x7f` for Backspace, `\x1b[A` for Up). Something has to keep the line being typed, move the cursor, recall history, and decide when a line is finished. That's what a shell's line editor does, and `LineEditor` is ours.
2. The engine tags each output line with a tone (`staged`, `untracked`, `hunk`...). `tones.ts` maps each tone to an ANSI color code, and xterm renders those codes as colors. The engine stays color-free and testable with plain text.
3. `aria-hidden` only hides content from screen readers. The hidden textarea kept keyboard focus, so typing still went into an invisible terminal (Chrome warns about exactly that). `inert` makes the whole panel unfocusable and non-interactive, and removes focus from it.

</details>

---

## #45 feat: code editor opened with code <file>

https://github.com/KyleBuildsAI/ship-it/pull/45

1. You edit `app.ts` in the editor but don't press Ctrl+S, then run `git add app.ts` and commit. What ends up in the commit?
2. Why is the editor loaded with `React.lazy` while the terminal loads right away?
3. What does the `key={openFile}` on `<EditorPanel>` accomplish when you run `code a.ts` and then `code b.ts`?

<details><summary>Answers</summary>

1. The old version. `git add` copies what's on disk, and your edit was only in the editor's memory. Saving writes it to the Workbench, and only then can git stage it.
2. The terminal is visible from the first frame and used constantly. The editor is ~600 kB of code that many sessions never open. Loading it on first use keeps the first screen fast.
3. A different `key` makes React throw away the old editor and mount a fresh one. The new file starts with its own content and a clean "unsaved" state, instead of inheriting `a.ts`'s editor.

</details>

---

## #46 feat: floating campus island with act portals

https://github.com/KyleBuildsAI/ship-it/pull/46

1. Why does the portal's `group.lookAt(0, 0, 0)` make every portal face the player at spawn?
2. What would go wrong in screenshot tests if the stars used `Math.random()` instead of `seededRandom(184)`?
3. Why does `boot.ts` pass `Math.min(timer.getDelta(), 0.1)` to `world.update` instead of the raw delta?

<details><summary>Answers</summary>

1. `lookAt` turns an object to face a point. Every portal faces the island's centre, and the player spawns near the centre, so all eight portals face inward toward you.
2. Every load would place the stars differently, so two screenshots could differ because of the stars instead of real animation. The test is meant to prove the render loop is live, so a random background would hide a frozen loop.
3. After the tab has been in the background, the next delta can be seconds long. Once walking exists, "speed × delta" would then move the avatar metres in one frame. Clamping to 0.1 s keeps every step small.

</details>

---

## #47 feat: walk the campus with WASD and click-to-walk

https://github.com/KyleBuildsAI/ship-it/pull/47

1. You orbit the camera to look at the avatar from the side, then press W. Which way does the avatar walk, and which function decides that?
2. Why does `stepToward` return `arrived: true` when the remaining distance is less than one step, instead of always moving a full step?
3. What bug would appear if `onKey` ignored `isTypingTarget` on key-up as well as key-down?

<details><summary>Answers</summary>

1. Into the screen, away from the camera. `keyDirection` rotates "forward" by the camera's azimuth angle, from `controls.getAzimuthalAngle()`.
2. A full step would overshoot the target, so the next frame would step back, and the avatar would jitter around the clicked spot forever. Snapping to the target and reporting arrival stops it cleanly.
3. Press W in the world, click into the terminal, then let go. The key-up would be ignored because it came from the terminal, so `keys.forward` would stay true and the avatar would keep walking. Only key-down is filtered, so a release always registers.

</details>

---

## #48 feat: travel through the act 2 portal to the git world

https://github.com/KyleBuildsAI/ship-it/pull/48

1. Why do both islands live in one scene at different positions, instead of being two separate scenes?
2. What would happen if you double-clicked the portal quickly and `travel` didn't check `travelling` first?
3. The Git World's areas are named Workbench, Loading Dock, and Vault. Which real git concept does each one stand for?

<details><summary>Answers</summary>

1. One scene means one render loop, one camera, and one set of lights. Travel is just moving the player. Switching scenes would mean rebuilding or keeping two sets of everything, and objects in one scene couldn't animate into the other.
2. Two `setTimeout(arrive)` calls would be queued. The second could fire after you'd started walking in the new zone and teleport you back to the spawn point. The flag makes travel happen once.
3. Workbench = the working tree (your files on disk). Loading Dock = the staging area, or index (what the next commit will contain). Vault = the repository (committed snapshots).

</details>

---

## #49 feat: files as crates on the workbench, dock, and blocklist

https://github.com/KyleBuildsAI/ship-it/pull/49

1. You run `git add README.md`. Which two crates exist for README.md afterwards, and why is there still one on the Workbench?
2. Why does the world redraw from `describeCrates(workspace)` instead of listening for an "added" event and moving that one crate?
3. What would you see if crates had no stable `key` and were rebuilt from scratch on every change?

<details><summary>Answers</summary>

1. One on the Workbench (the file is still on disk in your working tree) and one on the Dock (a copy is staged for the next commit). Staging copies the file into the index. It doesn't move it off your disk.
2. Many commands change several things at once (`git add .`, `git reset --hard`, `git commit -a`). Listening for each event would need special-case code per command, and it would drift from the truth. Describing the whole state is always right, whatever command ran.
3. Every crate would vanish and reappear on every command, with no flights. You couldn't see which crate moved where, which is the whole point.

</details>

---

## #50 feat: commit path with branch banners, head, and footprints

https://github.com/KyleBuildsAI/ship-it/pull/50

1. After `git reset --hard HEAD~1`, why does the undone commit move to lane 1 instead of disappearing?
2. How does `describeHistory` decide how far along the path a commit floats?
3. Why does `rebuildBridges` call `disposeChildren` before building new bridges?

<details><summary>Answers</summary>

1. The commit still exists in the object store, and the reflog still remembers it. No branch or HEAD can reach it any more, so it's no longer on the main road. Lane 1 shows exactly that: present and recoverable, but off the road.
2. By depth: the number of first-parent steps back to the root commit. The root is depth 0, its child is 1, and so on. The path position is the start point plus depth times the spacing, along the path direction.
3. Each rebuild creates new geometries. Without `dispose()`, the old ones would stay in GPU memory even after being removed from the scene, and memory would grow with every command.

</details>

---

## #51 feat: click the git world to get the matching git command

https://github.com/KyleBuildsAI/ship-it/pull/51

1. Why does clicking a crate show a command instead of just staging the file?
2. You click a Dock crate and press Run. What exactly happens, from the click to the crate moving?
3. Why does "Run" send `\r` through `typeRef` instead of calling `shell.run()` directly?

<details><summary>Answers</summary>

1. Pillar 2: you should always see and use the real command. If clicks changed state silently, you'd learn to click instead of learning git, and nothing would carry over to a real terminal on SandCastles.
2. `onPointerUp` raycasts, and `pickTarget` returns the crate. `suggestFor` builds `git restore --staged <file>`, and `suggest()` puts it in the hud store, so the chip renders. Run calls `sendToTerminal`, which sets `pendingCommand`. The TerminalPanel effect puts the text on the prompt and sends `\r`. The shell runs it, the engine fires events, the world marks the crates as dirty, and on the next frame `describeCrates` moves the crate back to the Workbench.
3. So there is exactly one way commands run. History, prompt redraw, error tones, and opening the editor all happen in `type()`. Calling the shell directly would skip some of that, and bugs would appear only for clicked commands.

</details>

---

## #52 feat: versioned save schema validated with zod

https://github.com/KyleBuildsAI/ship-it/pull/52

1. A save file is hand-edited so `xp` is `-50`. Would TypeScript catch it? Would zod?
2. Why is `schemaVersion` `z.literal(1)` instead of `z.number()`?
3. Why is `practiceDays` required to be sorted and unique?

<details><summary>Answers</summary>

1. TypeScript wouldn't. The file is read at runtime, long after type checking. zod would, because `xp` uses `countSchema` (an integer ≥ 0), so parsing fails and the save is rejected instead of silently loading bad data.
2. This schema describes exactly version 1. An older or newer save must go through migrations (or be refused) first, and a literal makes the schema reject any other version outright.
3. Then "days practiced" is simply the array's length, and "last practiced" is the last element. Nothing has to deduplicate or sort at read time, and the schema guarantees it stays true.

</details>

---

## #53 feat: store the save in indexeddb with migrations

https://github.com/KyleBuildsAI/ship-it/pull/53

1. A save has `schemaVersion: 0`. What does `migrate` do with it, step by step?
2. Why does `loadSave` throw on a damaged save instead of starting a fresh game?
3. What's the difference between `db.version(1)` and `CURRENT_SCHEMA_VERSION`?

<details><summary>Answers</summary>

1. It reads version 0, checks it isn't newer than the current version (1), runs `MIGRATIONS.slice(0)` (just `moveXpIntoProfile`), and validates the result against `saveDataSchema`. If it's valid, it returns the save, and `loadSave` stores the upgraded copy so the next load skips migrating.
2. Replacing it would silently destroy the player's progress. Throwing lets the UI explain what happened and offer to import a backup or reset on purpose.
3. `db.version(1)` describes IndexedDB's tables and keys. It only changes if the table layout changes. `CURRENT_SCHEMA_VERSION` describes the save data's shape, which will change more often, and is handled by migrations inside the data.

</details>

---

## #54 feat: export, import, and debounced autosave for the save

https://github.com/KyleBuildsAI/ship-it/pull/54

1. You finish three steps within 200 ms. How many times is IndexedDB written, and which save is written?
2. Why is `onError` a required option instead of an optional one?
3. What does a player see if they import a JSON file from a newer version of the game?

<details><summary>Answers</summary>

1. Once, about 500 ms after the third step, and it writes the third (newest) save. Each `schedule` replaced the pending save and restarted the timer.
2. Autosave runs in the background, so nobody awaits it. If the write failed and there was no handler, the failure would disappear, and the player would lose progress without knowing. Making it required forces every caller to decide how to report it.
3. An `ImportError` with reason `newer-version` and a plain message saying the file comes from a newer version of SHIP IT. The current save is untouched, because loading a newer save could drop fields this version doesn't know about.

</details>

---

## #55 feat: xp awards, ranks, and calendar day helpers

https://github.com/KyleBuildsAI/ship-it/pull/55

1. You've completed Acts 1, 2, and 4 (Act 4 by placement test). What's your rank, and what does `nextRank` say?
2. Why does `addDays` do its maths in UTC instead of your local timezone?
3. An Act's missions are worth 100, 120, and 150 XP. How much XP does testing out give?

<details><summary>Answers</summary>

1. Mid. The highest completed Act is 4, which unlocks Mid. `nextRank` returns `{ rank: 'Senior', unlockedByAct: 6 }`.
2. On a daylight-saving night, a local day is 23 or 25 hours long, so "add 24 hours" can land on the same day or skip one. A UTC day is always exactly 24 hours.
3. 185. The total is 370, and 50% of that is 185 (rounded, which changes nothing here).

</details>

---

## #56 feat: sm-2 review queue for missed drills

https://github.com/KyleBuildsAI/ship-it/pull/56

1. You miss drill `stage-one` today. When is it due, and what happens if you then get it right quickly three reviews in a row?
2. Only 2 items are due today, and 8 more are coming up. What's in today's daily set?
3. Why is there a one-year cap on the gap?

<details><summary>Answers</summary>

1. It's due today. First pass: the gap is 1 day. Second: 6 days. Third: about 6 × easiness, which is around 16 days, because each quality-5 answer also nudges easiness up by 0.1.
2. The 2 due items, plus the 3 coming up soonest, making 5, the minimum. It's never more than 10.
3. Without it, gaps multiply forever. The daily set's top-up means small queues get reviewed daily, so gaps explode within weeks and the dates overflow. A year also keeps every drill coming back eventually.

</details>

---

## #57 feat: player stats and concept mastery

https://github.com/KyleBuildsAI/ship-it/pull/57

1. A concept has 9 attempts, all correct. Is it mastered? What about 10 attempts with 9 correct?
2. Why does `drillAccuracy` return `null` instead of `0` when there are no attempts?
3. You practise on Monday, skip Tuesday, and practise Wednesday. What's `practiceDayCount`, and did anything reset?

<details><summary>Answers</summary>

1. No: under 10 attempts is never mastered. Yes: 9 of 10 is exactly 90%, which meets the bar.
2. Zero would claim you got everything wrong. `null` says there's no data yet, so the UI can show "—" or "No drills yet" instead of a discouraging 0%.
3. 2, and nothing reset. Days are counted, not streaks, so skipping a day never costs anything.

</details>

---

## #58 feat: mission predicate language that grades by state

https://github.com/KyleBuildsAI/ship-it/pull/58

1. A mission step's success is `{ kind: 'staged', paths: ['a.ts', 'b.ts'] }`. The player runs `git add .`, which also stages `c.ts`. Does the step pass? What if the predicate had `exact: true`?
2. Why is "grade by state" better than checking that the player typed `git add a.ts b.ts`?
3. How would you express "the working tree is clean and the last commit message starts with `feat:`"?

<details><summary>Answers</summary>

1. Yes: every listed path is staged, and extra staged files are allowed. With `exact: true` it fails, because `exact` means nothing else may be staged.
2. There are many correct ways to reach a state (`git add .`, `-A`, one file at a time, `git commit -a`). Checking strings would reject correct work and teach one memorised incantation instead of the concept.
3. `{ kind: 'all', of: [{ kind: 'clean' }, { kind: 'headMessage', pattern: '^feat:' }] }`

</details>

---

## #59 feat: mission and act schemas validated with zod

https://github.com/KyleBuildsAI/ship-it/pull/59

1. A content author writes a step with only two hints. What happens, and when?
2. Why reject unknown keys instead of ignoring them?
3. What's the difference between `MissionInput` and `Mission`?

<details><summary>Answers</summary>

1. Parsing fails with an error at that step's `hints` path (a tuple of exactly 3). It happens in the content tests, long before any player sees the mission.
2. An ignored key is usually a typo, and a typo can silently flip a check's meaning (`exist: false` is ignored, so the file is checked to exist). Rejecting it turns a silent grading bug into a loud test failure.
3. `MissionInput` is what authors write, where defaults like `xp` and `timeLimitSeconds` can be left out. `Mission` is the parsed result, with every default filled in, which is what the runner uses.

</details>

---

## #60 feat: mission sandboxes and grading for drills, questions, and placement

https://github.com/KyleBuildsAI/ship-it/pull/60

1. A drill's time limit is 90 s. You reach the target state in 95 s. What does `scoreDrill` say, and where does the drill go?
2. You get 11 of 13 placement questions right. Do you test out?
3. Why does `applySteps` call `stagePaths` instead of writing to the index directly?

<details><summary>Answers</summary>

1. Correct but overtime, so it's scored as a miss, and the drill joins the review queue. Drills train recall speed, and a slow answer means it isn't automatic yet.
2. No. 11/13 is about 84.6%, below 85%. The check uses the exact fraction, so rounding can't turn it into a pass.
3. `stagePaths` is what `git add` uses, and it fires the `staged` event. The 3D world listens for events to redraw crates. Writing the index directly would change the repo silently, and the world would show the wrong state.

</details>

---

## #61 feat: mission and boss runs as pure state machines

https://github.com/KyleBuildsAI/ship-it/pull/61

1. A mission has steps "stage README.md" and "commit it". The player types `git commit -am "docs: readme"` first. What does `checkStep` do?
2. Why does `tick` record fired twists by index instead of just comparing times?
3. Why is time passed in as `nowMs` instead of calling `Date.now()` inside the runner?

<details><summary>Answers</summary>

1. It records an attempt on step 1, sees "staged" (or a later check) is satisfied, marks step 1 complete, then checks step 2, which is also true, and marks it complete too. With no steps left, the phase moves to drills.
2. `tick` is called on a timer, so the same moment is seen by several ticks. Recording the index makes each twist fire exactly once, even if two twists share a time or the timer jitters.
3. So the runner stays pure and testable. Tests can jump the clock instantly, and the same inputs always give the same result.

</details>

---

## #62 feat: cross-check act content before it ships

https://github.com/KyleBuildsAI/ship-it/pull/62

1. A mission file says `act: 3`, but Act 2 lists it. What does `validateAct` report?
2. Why doesn't the mission schema catch a placement test that references a missing drill?
3. Why return a list of issues instead of throwing on the first one?

<details><summary>Answers</summary>

1. `mission <id>: Says act 3, not 2.`
2. The placement test lives in the Act schema, and the drills live in mission files. Neither schema sees the other's data, so the link can only be checked with both in hand.
3. Content authors fix everything in one pass. Throwing on the first problem would turn 5 problems into 5 separate edit-and-rerun cycles.

</details>

---

## #63 test: capture real git output as paste-verification fixtures

https://github.com/KyleBuildsAI/ship-it/pull/63

1. Why capture real git output instead of writing example outputs by hand?
2. What would go wrong if `capture.ps1` didn't pin the commit dates?
3. Why does the script restore environment variables in a `finally` block instead of at the end of the script?

<details><summary>Answers</summary>

1. Hand-written examples reflect what we think git prints. Real output includes details we'd never guess (hint lines, spacing, quoting rules), and a parser that passes on real output works on Kyle's real pastes.
2. Every run would produce different commit hashes, so the fixtures would change every time, and tests couldn't assert exact hashes.
3. `finally` runs even when the script fails partway. Restoring only at the end would leave the terminal changed after any error, which is exactly when you'd least notice.

</details>

---

## #64 feat: clean pasted terminal text and decode git's quoted paths

https://github.com/KyleBuildsAI/ship-it/pull/64

1. Why does `normalizePaste` keep the copied command instead of throwing it away with the prompt?
2. What does git print for a file named `café.md` in `git status --short`, and why?
3. Why must color codes be removed before parsing?

<details><summary>Answers</summary>

1. A clean `git status --short` prints nothing. Only the copied command line proves the empty paste really was a status, not an accidental empty paste.
2. `?? "caf\303\251.md"`. Git quotes names with non-ASCII bytes and writes each byte of `é` as an octal escape (`\303\251` is `é` in UTF-8).
3. Colored output wraps words in invisible escape sequences, so `modified:` would really be `\x1b[31mmodified:` and never match the parser's patterns.

</details>

---

## #65 feat: parse git status --short, -sb, and --porcelain pastes

https://github.com/KyleBuildsAI/ship-it/pull/65

1. What does `MM src/app.ts` mean in `git status --short`?
2. Why isn't an empty paste treated as a clean tree by default?
3. What does the `-b` in `git status -sb` add, and what does the parser read from it?

<details><summary>Answers</summary>

1. `src/app.ts` has staged changes (first M, the index) and further unstaged edits on top (second M, the worktree). Committing now would record only the staged version.
2. An empty paste could mean "clean tree" or "you pasted nothing". Passing it would let an empty text box pass a Field Mission check. It counts as clean only with proof: a branch header or the copied command.
3. A `## branch...upstream [ahead N, behind M]` header line. The parser reads the branch name, the upstream, and the ahead/behind counts.

</details>

---

## #66 feat: parse the default git status output

https://github.com/KyleBuildsAI/ship-it/pull/66

1. A paste has one line the parser doesn't recognize, and otherwise says "nothing to commit". Is it clean? Why?
2. What does "Your branch and 'origin/main' have diverged" mean for Kyle's next push?
3. Why is the stash count note recognized explicitly instead of ignoring every unknown line?

<details><summary>Answers</summary>

1. No. The unknown line becomes a warning, and a paste with warnings is never clean. It could be something important (a merge in progress, say), so the parser refuses to guess.
2. Both sides have commits the other doesn't. A plain `git push` will be rejected, and he must integrate origin's commits first (merge or rebase, taught in Act 3).
3. Ignoring every unknown line could hide a real problem and pass a dirty tree. Listing known-safe notes one by one keeps the parser strict everywhere else.

</details>

---

## #67 feat: parse git log --oneline and detect which command was pasted

https://github.com/KyleBuildsAI/ship-it/pull/67

1. What does `a1b2c3d (HEAD -> main, origin/main) fix: stop double deploys` tell you about your branch and the remote?
2. Why is one long-status-only line enough to classify a paste as long status, while short status needs every line to fit?
3. How does the parser tell a graph connector line from a commit line?

<details><summary>Answers</summary>

1. HEAD is on `main`, `main` is at commit `a1b2c3d`, and `origin/main` points at the same commit, so local and remote agree (nothing to push or pull for this branch).
2. Long status contains many kinds of lines, some of which the parser may not know (like rebase progress), so one unmistakable marker such as "Changes not staged for commit" is enough. Short status lines are uniform (`XY path`), so every line should match, or it probably isn't short status.
3. Commit lines have a `*` in the graph prefix followed by a hash and a subject. Connector lines are only `|`, `/`, `\`, and spaces.

</details>

---

## #68 feat: field mission checks over parsed pastes

https://github.com/KyleBuildsAI/ship-it/pull/68

1. Your last 4 commits are `feat: x`, `Merge branch 'y'`, `fix: z`, and `wip`. What's the Conventional ratio, and why?
2. Why can't `git status` prove that `.env` isn't tracked?
3. What would the sandbox parity test catch?

<details><summary>Answers</summary>

1. 2 of 3 is about 67%. The merge subject was written by git, so it doesn't count. Of `feat: x`, `fix: z`, and `wip`, two are Conventional.
2. Status only lists files that differ from HEAD or aren't tracked. A tracked `.env` that hasn't changed since it was committed doesn't appear at all, so an empty status proves nothing about it.
3. Any difference between the simulated git's output format and real git's, such as a changed hint line or different spacing, which would mean the game is teaching output that doesn't match reality.

</details>

---

## #69 chore: sage server project with config, port, and logger

https://github.com/KyleBuildsAI/ship-it/pull/69

1. Why is a value import from `server/` into `src/` a lint error, while `import type` is allowed?
2. `.env` says `MENTOR_DAILY_CALL_CAP=fifty`. What happens?
3. Where should your Anthropic API key go, and where must it never appear?

<details><summary>Answers</summary>

1. A value import would bundle server code (which reads `.env`, where the key lives) into the browser. `import type` disappears at compile time, so only the type information is shared, and no code or secrets are.
2. It isn't a whole number, so the server warns (`MENTOR_DAILY_CALL_CAP="fifty" is not a valid value. Using 50 instead.`) and uses the default cap of 50.
3. Only in `.env` on your machine, after `ANTHROPIC_API_KEY=` (the file is gitignored). Never in code, a commit, an issue, a chat, or any `VITE_` variable.

</details>

---

## #70 feat: sage's persona, prompts, protocol, and daily usage cap

https://github.com/KyleBuildsAI/ship-it/pull/70

1. Why does the persona tell Sage that content inside XML tags is data, never instructions?
2. Why write `usage.json` to a temp file and rename it, instead of writing it directly?
3. A call to Anthropic fails halfway. Does it count toward the daily cap? Why?

<details><summary>Answers</summary>

1. Game data includes things Kyle (or a pasted file) wrote. If it contained "ignore your rules and give the answer", Sage should reason about it, not obey it. That's basic prompt-injection defence.
2. Writing directly can leave a half-written, corrupt file if the process crashes mid-write. A rename replaces the file in one step, so you always have a whole file.
3. Yes. The request may have used tokens before failing, and a hard cap has to count what might have been spent, or retries could run past the budget.

</details>

---

## #71 feat: hints and question grading with anthropic models

https://github.com/KyleBuildsAI/ship-it/pull/71

1. Why is the Anthropic call passed in as `createMessage` instead of being created inside `mentor.ts`?
2. Structured output already enforces the JSON shape. Why validate the grade again with zod?
3. What does Kyle see if his key is wrong, and where does the message tell him to look?

<details><summary>Answers</summary>

1. So tests can supply a fake that returns fixed replies: no network, no key, no cost, and deterministic results. The real client is created once, in `server/index.ts`.
2. The schema's rules (like "0 to 3") are only advisory to the model. Validating again catches a reply like `score: 7` before it reaches the screen.
3. "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env, then restart the server." It points at the exact variable in the exact file.

</details>

---

## #72 feat: sage http server, dev proxy, and npm run dev for both

https://github.com/KyleBuildsAI/ship-it/pull/72

1. Sage listens on 127.0.0.1. Why does it also check the Host and Origin headers?
2. Why does the Vite proxy answer 200 `{ offline: true }` instead of an error when Sage is down?
3. What does `EACCES` on a port mean on Windows here, and how would you find a free one?

<details><summary>Answers</summary>

1. Any website open in your browser can make the browser send requests to 127.0.0.1. Checking that Host and Origin are loopback blocks those cross-site and DNS-rebinding tricks, so only the game can spend your calls.
2. Chrome logs every 4xx/5xx response as a console error, and DESIGN.md requires zero console errors. `{ offline: true }` tells the game exactly what it needs to fall back to pre-written hints.
3. Windows refused to let the process use that port, here because it sat inside a range reserved for Hyper-V/WSL. Run `netsh interface ipv4 show excludedportrange protocol=tcp`, then pick a port outside every listed range and set `MENTOR_PORT` in `.env`.

</details>

---

## #73 feat: sage client with offline fallback, and how to turn sage on

https://github.com/KyleBuildsAI/ship-it/pull/73

1. On the GitHub Pages build, what happens when Kyle asks for a hint?
2. Why does the client refuse to call Sage during a drill when the server would refuse anyway?
3. What exactly should Kyle do to enable Sage, and what must he never do with the key?

<details><summary>Answers</summary>

1. The client reports Sage as offline (`no-server`) without any network request, and the mission shows the next rung of its pre-written hint ladder.
2. Two reasons. The server's 403 would show up as a console error, and a drill should involve no AI traffic at all (pillar 4). Guarding in both places means neither can be bypassed by a bug in the other.
3. Run `Copy-Item .env.example .env`, then `notepad .env`, paste the key after `ANTHROPIC_API_KEY=`, save, and run `npm run dev`. Never paste it into a chat, an issue, a commit, code, or a `VITE_` variable.

</details>

---

## #74 feat: load the save at startup and autosave every change

https://github.com/KyleBuildsAI/ship-it/pull/74

1. The stored save is corrupted. What does the game do with it, and what does the player see?
2. Why do changes go through `updateSave(change)` instead of editing `progress.get().save` directly?
3. When does a pending autosave get written early, and why then?

<details><summary>Answers</summary>

1. It leaves it untouched in IndexedDB, marks progress as `failed`, shows "Your save could not be read. Import a backup from Settings, or start over there.", and the badge shows `Save error`.
2. Editing the snapshot directly would change data other code is holding, never trigger an autosave, and never re-render the UI. `updateSave` makes a new snapshot, notifies subscribers, and schedules the write.
3. When the tab is hidden (`visibilitychange` to `hidden`), for example when switching tabs or closing the browser. It's the last reliable chance to write before the page may be killed.

</details>

---

## #75 feat: rules for how play changes the save

https://github.com/KyleBuildsAI/ship-it/pull/75

1. You finish mission 2.1, then replay it and finish again. How much XP does the replay pay, and what can still improve?
2. What happens to a drill you miss, and when does it come back?
3. You test out of Act 2 at 90%. What changes in the save?

<details><summary>Answers</summary>

1. Zero XP: steps, mission, and Question Round XP are one-time. The best drill score can still go up, and drill passes still earn their per-drill XP and practice days.
2. It's recorded in drill history and added to the review queue, due today. The Standup Board brings it back, then SM-2 spaces it out as you get it right.
3. Placement attempts +1, best percent 90, `testedOut: true`. Every unfinished Act 2 mission becomes "tested out", you get 50% of the Act's mission XP once, and the Act's `completedAt` is stamped.

</details>

---

## #76 feat: play a mission end to end, graded by the sandbox's state

https://github.com/KyleBuildsAI/ship-it/pull/76

1. How does the game know a step is done, without knowing which command Kyle typed?
2. A drill's time runs out while Kyle is mid-command. What happens?
3. Kyle asks for a hint, then solves the step before Sage answers. What does he see?

<details><summary>Answers</summary>

1. Every change to the sandbox fires engine events. `watchSandbox` calls back once per burst, and the runner evaluates the step's success predicate against the sandbox's current state. If it's true, the step is done.
2. `missionTick` sees the elapsed time pass the limit and grades the drill as the sandbox stands at that moment. If the target state isn't reached, it's a miss, recorded and queued for review.
3. Nothing stale. When Sage's reply arrives, the controller sees the step index changed and drops it, and the next step starts with no hint shown.

</details>

---

## #77 feat: placement tests, standup reviews, and the boss fight

https://github.com/KyleBuildsAI/ship-it/pull/77

1. What's the difference in how a placement drill and a review drill are recorded afterwards?
2. When exactly does a twist fire, and how does the 3D world find out?
3. Kyle's last command both completes every objective and commits `.env`. Win or lose?

<details><summary>Answers</summary>

1. Both go into drill history. A placement drill miss joins the review queue (due today), and the whole test is scored with `placementResult`. A review drill updates its existing queue item with SM-2 (a longer gap on a pass, tomorrow on a miss).
2. On the first tick where the clock shows the twist's seconds or fewer. `applySteps` writes, stages, or commits through the engine, which emits events, and the world redraws from them.
3. Lose. `checkBoss` evaluates the failure rules first, and breaking one ends the fight even if the objectives are met.

</details>

---

## #78 feat: act 2 content: missions 2.1-2.5, placement, boss, field mission

https://github.com/KyleBuildsAI/ship-it/pull/78

1. In the boss, why does `src/logger.ts` never show up as untracked, even though it isn't committed?
2. How do the tests prove a step can't be completed "by accident" before Kyle does the work?
3. Why does the Field Mission ask for `git ls-files` to check for secrets instead of `git status`?

<details><summary>Answers</summary>

1. The `.gitignore` has a `log*` rule, which also matches `logger.ts`. Ignored files don't appear as untracked, so git quietly hides it, and the deploy from a clean checkout is missing it.
2. The solvability tests check each step is *not* complete when it becomes the current step, before its commands run, and *is* complete afterwards. Drill tests check the untouched setup fails.
3. `git status` only lists files that changed or aren't tracked. A committed `.env` that hasn't changed never appears. `git ls-files` lists every tracked file, so a leaked `.env` shows up.

</details>

---

## #79 feat: act 2 on screen: act menu, mission, drill, and boss panels

https://github.com/KyleBuildsAI/ship-it/pull/79

1. Where does the objective checklist's ✓ come from? What decides it?
2. Why does the view shift by half the panel's width, not the whole width?
3. The boss button is disabled. What unlocks it?

<details><summary>Answers</summary>

1. The controller calls `explain(step.success, queries)` after every sandbox change. Each row's `passed` is that predicate evaluated against the current sandbox state, and the UI just renders it.
2. The scene should be centred in the visible area. The visible area's centre is half a panel-width to the right of the screen's centre.
3. Every Act 2 mission completed, or tested out through the placement test.

</details>

---

## #80 feat: field mission screen with paste verification

https://github.com/KyleBuildsAI/ship-it/pull/80

1. Why is `!! dist/` in a `git status --short --ignored` paste a pass for the "build output ignored" check?
2. You paste `git log` output into the `git status` check. What happens?
3. Why are passed checks saved one by one instead of only when all pass?

<details><summary>Answers</summary>

1. `!!` is how git marks ignored paths when you ask with `--ignored`. Seeing `dist/` behind `!!` proves `.gitignore` covers it, which is exactly the goal.
2. `detectPasteKind` sees log output, not status, so the check fails with a message to run the right command instead, like "That doesn't look like git status output. Run git status."
3. Real cleanup can take days. Saving each pass means Kyle can verify the history today and the clean tree tomorrow without redoing anything.

</details>

---

## #81 feat: standup board, trophy wall, and settings menus

https://github.com/KyleBuildsAI/ship-it/pull/81

1. What bug did the reload e2e test find, and why wasn't it caught by unit tests?
2. Why does text size change the terminal's font size instead of zooming it like the panels?
3. What's inside an exported save file, and what is deliberately never in it?

<details><summary>Answers</summary>

1. A step finished less than 500 ms before a reload was lost: the debounced autosave hadn't run, and writes started during unload aren't guaranteed. Unit tests call `flushProgress()` directly and never unload a page. Only a real browser reload shows it.
2. xterm.js measures character cells in pixels for the cursor, selection, and mouse. CSS zoom scales the pixels without telling it, so clicks land in the wrong place. Setting `fontSize` lets xterm re-measure properly.
3. `{ format: 'ship-it-save', exportedAt, data }`: XP, missions, Acts, drill history, the review queue, Field Mission checks, and settings. Never secrets: the GitHub token (M3) will be stored apart from the save, so a shared file can't leak it.

</details>

---

## #82 chore: m1 polish: how to play, troubleshooting, and a replay fix

https://github.com/KyleBuildsAI/ship-it/pull/82

1. Which M1 acceptance criterion does the reload e2e test prove, and which one does the export/import e2e test prove?
2. Why describe the game in words in the README instead of adding screenshots?
3. How was 60 fps checked, and what would you change on a much weaker GPU?

<details><summary>Answers</summary>

1. The reload test proves "progress survives closing the browser" (IndexedDB, saved immediately). The export/import test proves "export/import round-trips".
2. The repo rules forbid committing binary files: they bloat history forever and can't be diffed. The live Pages link shows the real thing instead.
3. By counting `requestAnimationFrame` callbacks over 3 seconds in the running game. On a weaker GPU, set Settings, Graphics quality to Medium or Low, which caps the pixel ratio (1.5 or 1), the biggest cost on high-DPI screens.

</details>

---

## #84 feat: one-click launcher that starts ship it and opens chrome

https://github.com/KyleBuildsAI/ship-it/pull/84

1. Why does the game refuse to start rather than moving to port 18174 when 18173 is busy?
2. How does the launcher know the server on 18173 is *your* SHIP IT and not some other app?
3. Why is a `.bat` file's line ending a special case in `.gitattributes`?

<details><summary>Answers</summary>

1. Your save lives in Chrome under the exact address `http://localhost:18173`. On 18174 the game would load with an empty save and look like your progress was gone. A clear failure message is better than a silent empty game.
2. The dev server answers `/__ship-it/checkout` with the folder it runs from, and the helper compares that with its own repo folder. Any other app either doesn't answer that path (a 404), or answers with a different folder.
3. The repo stores every text file with LF endings, but cmd.exe misreads LF-only batch files (labels and `goto` break). `*.bat text eol=crlf` makes git check them out with CRLF, which Windows expects.

</details>

---

## #86 fix: only the newest tab saves, handing over in order

https://github.com/KyleBuildsAI/ship-it/pull/86

1. You change a setting and, within half a second, the launcher opens a new tab. Why doesn't the new tab lose that setting?
2. What happens if the old tab is frozen in the background and never answers?
3. Why did the first version show "saved" in a tab that wasn't saving anything?

<details><summary>Answers</summary>

1. The new tab asks first and waits for the lock. The old tab stops writing, flushes the pending setting to IndexedDB, and only then releases the lock. The new tab loads after that, so it reads the save with the setting in it.
2. The new tab waits 1.5 s for an answer, then takes the lock anyway with `steal`. The frozen tab can't write while frozen, and when it wakes, its lock request fails with an AbortError, so it shows the notice and stops.
3. The steal arrived while that tab was still loading. The "stop writing" flag was set, but when the load finished it set the status back to "ready" and the badge to "saved", hiding the notice. Now "handed over" is final, and the load checks it before touching the status.

</details>

---

## #88 feat: jump with space, and stars all around the islands

https://github.com/KyleBuildsAI/ship-it/pull/88

1. Why can't you jump again while already in the air?
2. Why does `stepJump` use the average of the old and new velocity?
3. Why do the stars follow the camera instead of staying still in the world?

<details><summary>Answers</summary>

1. `startJump` only takes off when `isGrounded` is true, meaning at height 0 with no upward speed. In the air it returns the jump unchanged.
2. Using only the old velocity makes the jump slightly too high. Using only the new one makes it too low, and by an amount that depends on the frame rate. The average (the trapezoid rule) gives the same arc whether frames are long or short, as the "same arc at any frame rate" test checks.
3. They're "infinitely far away" scenery. Moving them with the camera keeps a full sky around the player on any island. Fixed in the world, they'd be off-centre for the Git World, 140 units from Campus.

</details>

---

## #90 feat: save v2 and action counters for the first-run tutorial

https://github.com/KyleBuildsAI/ship-it/pull/90

1. What does `migrate` do with a version 1 save, step by step?
2. Why count walks when a walk *starts* rather than on every frame the player is walking?
3. Why did the terminal's first line sometimes show two letters per row?

<details><summary>Answers</summary>

1. It reads `schemaVersion: 1`, then runs `MIGRATIONS.slice(1)`: just `addTutorial`, which adds `tutorial: { completedAt: null }` and sets `schemaVersion: 2`. Then it validates the result against the version 2 schema. All other fields are copied unchanged.
2. Every store update notifies its subscribers, and React re-renders anything reading that store. Updating on every frame would re-render the HUD about 60 times a second while walking. Counting only the start updates once per walk.
3. xterm wraps text at the width it has when the text is written. If the page loaded before it had a real width, the terminal was 2 columns wide at that moment, so the greeting wrapped every 2 letters, and it stays wrapped. Now the greeting waits until the terminal is at least 20 columns wide.

</details>

---

## #92 feat: first-run tutorial logic that advances when you do each step

https://github.com/KyleBuildsAI/ship-it/pull/92

1. Why does `isStepDone` take both `now` and `atStart`?
2. What happens if the tutorial reaches the "step into an Act" step while you're already in the Git World?
3. Why must `check()` hide the card *before* saving the finish?

<details><summary>Answers</summary>

1. The counters only ever go up, so "done" means "went up since this step began". `atStart` is the snapshot from when the step began, and `now` is the latest. Without `atStart`, a jump from before the jump step (or before a replay) would count.
2. `advance` checks the next step right away with the new baseline. The portal step's rule is "not on Campus, or the Act menu is open", which is already true, so it passes at once and the tutorial finishes.
3. Saving updates the progress store, which calls `check()` synchronously. If the last step were still showing, `check()` would see it done, save again, and recurse until the stack overflowed. Hiding first means the nested `check()` sees no tutorial running and a finished save, and does nothing.

</details>

---

## #93 feat: first-run tutorial card, with skip and replay

https://github.com/KyleBuildsAI/ship-it/pull/93

1. Why couldn't **Skip tutorial** be clicked at first, even though it was visible?
2. Why does Replay close Settings before starting?
3. What does the `return` inside the card's `useEffect` do?

<details><summary>Answers</summary>

1. The HUD layer (`#ui`) has `pointer-events: none`, so clicks pass through it to the 3D canvas. The card inherited that, so the canvas got the click. Adding `pointer-events: auto` to `.tutorial-card` opts it back in, like the terminal and menus.
2. The first step is walking. With Settings open, its panel has the keyboard, and it covers the world. Closing it puts the world back in view with the keys going to it, so WASD works straight away.
3. It's the effect's cleanup. React runs it when the card stops being "finished" (you pressed Close) or unmounts. It clears the 8-second timer so it can't fire later and close something it shouldn't.

</details>

---

## #94 feat: calm classical tracks and a pure playlist

https://github.com/KyleBuildsAI/ship-it/pull/94

1. Bach died in 1750. Why wasn't that enough to know his Prelude's recording is free to use?
2. Why does `nextInPlaylist` rotate the new order when its first piece is the one that just ended?
3. How do the tests make a shuffle predictable?

<details><summary>Answers</summary>

1. The composition is public domain, but each recording is a separate work owned by its performer or label. Kimiko Ishizaka released hers as CC0, and her Commons page says so. That's what makes this file usable.
2. Shuffles are independent, so a new round can start with the piece that ended the last one, and you'd hear the same piece twice in a row. Moving that piece from the front to the back of the new order prevents it.
3. `shuffled` takes `random` as a parameter. The tests pass `() => 0.999`, which makes every swap a swap with itself, so the order stays as written. Another test feeds chosen values to show all six orders of three items are possible.

</details>

---

## #96 feat: music player that waits for a click and fades pieces in

https://github.com/KyleBuildsAI/ship-it/pull/96

1. Why doesn't the player call `play()` as soon as the page loads?
2. You mute during the 4-second fade-in. What stops the fade from finishing at full volume?
3. What does the `attempts` counter protect against?

<details><summary>Answers</summary>

1. Chrome refuses sound before the player has interacted with the page: `play()` would reject with `NotAllowedError`. So the player waits for the first click or key press, which counts as that interaction.
2. Muting sets the volume setting to 0, which calls `sync()`. That calls `quieten()`, which starts a fade to 0. `fadeTo` always stops the running fade first, so the fade-in is cancelled.
3. `play()` answers later, asynchronously. If you stop the music (or a new piece starts) before it answers, a late "it's playing" must not mark the music as playing or start a fade. Each attempt gets a number, and only the latest one counts.

</details>

---

## #99 feat: music skips broken pieces and pauses while the tab is hidden

https://github.com/KyleBuildsAI/ship-it/pull/99

1. Why does the player stop trying after every piece has failed once, instead of retrying forever?
2. Why is `AbortError` ignored while other errors count as failures?
3. How does coming back to the tab resume the same piece instead of restarting it?

<details><summary>Answers</summary>

1. When every piece fails in a row, the cause is almost always the network, not the files. Retrying immediately would loop forever while offline, making requests and flickering the status. It waits for the browser's `online` event instead.
2. `AbortError` means `play()` was interrupted on purpose: the music was muted or paused while a piece was still loading. Nothing broke, so nothing needs skipping. Other errors mean the file couldn't play.
3. Hiding the tab only pauses the audio element, which keeps its position. `play()` compares the piece with `loaded`, the file the element already holds. It's the same, so `src` isn't set again, and `play()` carries on from where it paused.

</details>

---

## #98 fix: space jumps after a world or hud click instead of pressing a button

https://github.com/KyleBuildsAI/ship-it/pull/98

1. Why did pressing Space after clicking a crate run the suggested command?
2. How does `releaseMouseFocus` tell a mouse click from a keyboard press?
3. Why are the test hooks installed only when `navigator.webdriver` is true?

<details><summary>Answers</summary>

1. The chip called `focus()` on its Run button whenever it appeared. The jump handler ignores keys aimed at anything but the page or the canvas, so the Space press went to the focused button. The browser's default action for Space on a button is to click it, which ran the command.
2. The click event's `detail` is the mouse click count: 1 or more for a mouse click, 0 when Enter or Space pressed the button. Only a `detail` above 0 releases focus.
3. They're for tests only. Players don't need a global object that exposes the world's state. `navigator.webdriver` is true only when a browser is driven by automation, as Playwright does, so real players never get the hooks.

</details>

---

## #100 refactor: world zones registry, and portals routed by act

https://github.com/KyleBuildsAI/ship-it/pull/100

1. What has to change to open Act 1's portal once its island exists?
2. How does walking into a portal with WASD make you travel?
3. Why does the Chrome test ask the page where the portal is, instead of clicking a fixed pixel?

<details><summary>Answers</summary>

1. Add `1: 'machine'` to `ZONE_FOR_ACT` (plus the island itself, as a zone). `openActs()` reads that table, so Campus draws Act 1's portal open, and `zoneForAct(1)` tells clicks and steps where it leads.
2. After moving each frame, `update` calls `doorwayAt(position, zones[zone].doorways)`. When the avatar is within 0.9 of an open portal ring's centre, it returns that portal, and `travel(doorway.to)` fades to the other island.
3. Where the portal lands on screen depends on the window size and the camera. A fixed pixel would break on a different screen. The test hook projects the ring's real 3D position through the camera, so the test clicks exactly where the portal is drawn.

</details>

---

## #101 feat: music settings, a hud music button, and credits

https://github.com/KyleBuildsAI/ship-it/pull/101

1. How do the end-to-end tests play music without reaching Wikimedia?
2. Why does unmuting restore the old volume instead of a fixed one?
3. The music test checks that no music request happens before the first click. Why is that worth testing?

<details><summary>Answers</summary>

1. The shared fixture calls `context.route('https://upload.wikimedia.org/**', …)` for every test's browser context. Chrome's request for a music file is answered on the spot with a generated one-second WAV of silence.
2. Muting only sets the volume to 0, so the old volume would be lost. `mute.ts` remembers the last volume above 0 on this page, and unmuting puts it back.
3. Browsers refuse sound before an interaction, so loading earlier would waste bandwidth and could log autoplay errors. The test proves the player really waits.

</details>

---

## #102 fix: move the tutorial card off the act 2 portal

https://github.com/KyleBuildsAI/ship-it/pull/102

1. Why is the top left a better spot for the card than the top right?
2. How does the card know where the Act panel ends?
3. Why wasn't the bottom right used?

<details><summary>Answers</summary>

1. From the spawn point, the open Act 2 portal is on the right and the locked portals are on the left. Top right hid the portal the last step points at. Top left only covers locked ones.
2. `PlayPanel` measures its own right edge and stores it as `worldState.leftInset` (the camera already uses it to frame the scene). `TutorialCard` reads it and sets `left` to 16px past it.
3. In a narrower window, a card above the terminal on the right overlapped the HUD buttons (Trophies, Settings) and the avatar.

</details>

---

## #103 refactor: the catalog holds every act, and activities know theirs

https://github.com/KyleBuildsAI/ship-it/pull/103

1. Why does a review series have `act: null` while a placement test has a number?
2. How does finishing a mission know which Act to record it on?
3. The old check `acts['2']?.completedAt).not.toBeNull()` looked right. Why didn't it prove anything?

<details><summary>Answers</summary>

1. A placement test belongs to one Act: its drills come from that Act, and testing out completes that Act. Reviews mix drills from every Act you've played, so there's no single Act to record them on. Each drill's own result is saved by drill id instead.
2. Every mission's data includes its Act (`mission.act`). `submitQuestionRound` calls `getAct(current.mission.act)` and passes that Act to `completeMission`.
3. With `?.`, a missing `acts['2']` makes the expression `undefined`, and `undefined` is "not null", so the check passed even when nothing was saved. `toEqual(expect.any(String))` only passes when a real completion time is there.

</details>

---

## #105 feat: an acts menu with a tab per act, and per-act placement pitch

https://github.com/KyleBuildsAI/ship-it/pull/105

1. Why must drill ids be unique across Acts, not just within one?
2. You open Act 2's menu from the HUD, then walk into Act 1's island. Which menu shows, and why?
3. Why is the placement pitch in Act 2's content instead of in `ActMenu.tsx`?

<details><summary>Answers</summary>

1. The review queue in the save stores just the drill id, and `findDrill` searches every Act for it. If two Acts shared an id, a review could load the other Act's drill, with a different setup and answer.
2. Act 1's. Travelling calls `closeActMenu()`, so `hud.actMenu` is null when you arrive. `PlayPanel` then falls back to `actForZone('machine')`, the island's own Act.
3. The pitch is about the Act ("Already know git?"), and Act 1's needs different words. Content belongs in `src/content` as data (DESIGN.md section 10). The component only shows whatever the Act says.

</details>

---

## #106 refactor: file tree interface with a mounted subtree view

https://github.com/KyleBuildsAI/ship-it/pull/106

1. Why does `SubtreeFs` rename the path inside an error before rethrowing it?
2. Why can't the mount itself be removed through the view?
3. How would the parity test catch a bug where `SubtreeFs.allFiles` forgot to strip the mount?

<details><summary>Answers</summary>

1. The shell words its messages from the error's path. Without renaming, a missing `src/nope.ts` would be reported as `Users/kyle/quillwork/app/src/nope.ts`, which a standalone project would never say. `inside` maps it back to the path the caller used.
2. A `VirtualFs` refuses to remove its root (`''`), and the mount is this view's root. Allowing it would delete the whole project folder from the drive, something no tree of its own can do.
3. The table has steps "every file" and "files under a folder". On `VirtualFs` they return `['src/app.ts']`, and a broken view would return `['Users/kyle/quillwork/app/src/app.ts']`. The outcomes differ, so the test fails and names the step.

</details>

---

## #107 feat: windows paths and case-insensitive environment tables

https://github.com/KyleBuildsAI/ship-it/pull/107

1. What does `toCanonical('C:', …)` return, and why isn't it the root?
2. Why does setting a variable to `''` delete it?
3. Why does `resolveExisting` return the stored spelling instead of what was typed?

<details><summary>Answers</summary>

1. The current folder. On Windows, `C:` without a backslash means "the current directory on drive C", so `cd C:` from `C:\Users\kyle` stays put. Only `C:\` means the root.
2. That's Windows' rule: an environment variable can't have an empty value, and PowerShell's `$env:NAME = ''` removes it. The table matches it, so `Test-Path env:NAME` answers the way Kyle's machine does.
3. The prompt and listings show the folder's real name (`C:\Users\kyle\Documents`), not however it was typed. Windows keeps the stored casing, and so does the simulation.

</details>

---

## #108 feat: machine model with a drive, env scopes, and terminal tabs

https://github.com/KyleBuildsAI/ship-it/pull/108

1. You run `setx EDITOR code` in tab 1. Does tab 1 see `$env:EDITOR`? Does a tab opened afterwards?
2. Why does the Machine Path come before the User Path in a new tab's `Path`?
3. Why do `envChanged` events carry the name but not the value?

<details><summary>Answers</summary>

1. No, then yes. `setx` writes the saved User scope. Tab 1's environment is the copy it made when it opened, so it doesn't change. A new tab builds its copy from the saved scopes, so it has `EDITOR`.
2. That's how Windows builds it: system entries first, then the user's. It matters when two folders hold a program with the same name, because the first one on the Path wins. Act 1's PATH mission is built on that.
3. Anything can listen to events: the 3D world, logs, and later Sage's context. A value might be an API key. With no field for it, no listener can leak it. The world reads values straight from the machine when it needs them, and masks secret-looking names.

</details>

---

## #109 test: capture real powershell 7.6 output for act 1

https://github.com/KyleBuildsAI/ship-it/pull/109

1. Why does `Save-Error` start a fresh `pwsh` instead of running the command in the script?
2. Which captures can't be compared byte for byte, and why?
3. What stops your real username from ending up in these files?

<details><summary>Answers</summary>

1. An error inside a script shows the script's file and line (`Set-Location: C:\...\capture-shell.ps1:129 Line | ...`). A command typed at the prompt shows one line, and that's what the player must see. A fresh `pwsh -Command` behaves like the prompt.
2. `get-process-self` (memory and CPU change every run), `get-command` (versions and install paths are machine-specific), and the tool versions. Tests compare their shape (headers and columns), not their numbers.
3. `ConvertTo-Stable` replaces the throwaway folder's path and `$env:USERPROFILE` with `C:\Users\kyle` before saving. A test also fails if any capture contains `C:\Users\<anyone else>\`.

</details>

---

## #110 feat: terminal tabs close, switch, restart, and remember cd history

https://github.com/KyleBuildsAI/ship-it/pull/110

1. You have tabs 1, 2 and 3, and you're in tab 2. You close it. Which tab has the keyboard?
2. After `restartTerminals`, which of these survive: a `setx` value, a `$env:` value, the folder you were in?
3. From your home folder you go to `A`, then `B`, then run `cd -` twice. Where are you, and where would bash leave you?

<details><summary>Answers</summary>

1. Tab 3, the most recently opened tab left. It announces `sessionClosed` for tab 2, then `sessionActivated` for tab 3.
2. Only the `setx` value, because it's saved in the User scope and the new tabs copy it. The `$env:` value lived only in the old tab's copy, and every tab goes back to the home folder.
3. Home. The first `cd -` goes back to `A`, and the second goes back again to your home folder, because PowerShell keeps a history of up to 20 folders. Bash keeps only one "previous folder", so its second `cd -` would toggle you back to `B`. `cd +` would then take PowerShell forward to `A`.

</details>

---

## #111 feat: a case-insensitive windows drive for the laptop

https://github.com/KyleBuildsAI/ship-it/pull/111

1. You create `notes.txt`, then write to `NOTES.TXT`. How many files are there, and what are they called?
2. Why does `stored('users/kyle/New Folder/a.txt')` keep `New Folder` as typed?
3. Why wrap `VirtualFs` instead of making `VirtualFs` itself case-insensitive?

<details><summary>Answers</summary>

1. One, called `notes.txt`. `NOTES.TXT` finds the stored spelling first, so the write modifies the existing file, as on Windows.
2. That part doesn't exist yet, so there's no stored spelling to use. New names are created as typed, and keep that spelling from then on.
3. Act 2's project folder and git are case-sensitive in the existing engine, and their tests depend on it. Only the Windows laptop should ignore case, so the behaviour belongs to the laptop's drive.

</details>

---

## #112 refactor: move the fixture builder into the engine root

https://github.com/KyleBuildsAI/ship-it/pull/112

1. Why does `src/engine/git/fixtures.ts` still exist?
2. How can you check that this PR changes no behaviour?
3. Why move the builder before adding the laptop steps, instead of both at once?

<details><summary>Answers</summary>

1. Twelve files import the builder from it, including every Act 2 mission. The re-export keeps those imports working without touching Act 2.
2. Every existing test (unit and end-to-end) passes unchanged. The diff of `src/engine/fixtures.ts` against the old `git/fixtures.ts` shows only the import lines differ.
3. A move plus new features in one diff hides the new code among moved lines. Moving first makes the next PR's diff show exactly what's new.

</details>

---

## #113 feat: windows() sandboxes with a stock laptop

https://github.com/KyleBuildsAI/ship-it/pull/113

1. In a `windows()` setup, where does `write('notes.md', …)` put the file, and where does `stage('notes.md')` look for it?
2. Why does a setup that opened no terminal get one at the end?
3. How does the test prove a boss twist leaves a laptop exactly as building it would?

<details><summary>Answers</summary>

1. `write` takes a drive path, so the file lands at `C:\notes.md`, the root of the drive. `stage` acts on the mounted project and looks for `~\quillwork\app\notes.md`. Mission content writes project files with their full drive path, like `Users/kyle/quillwork/app/notes.md`.
2. Every Act 1 activity starts with the player typing into a terminal, so there must be one. Opening it at the end means it copies every saved variable the setup made. A setup that wants a stale terminal opens it earlier on purpose.
3. It builds one laptop with every step, builds a second with only `windows()` and `session()`, then applies the remaining steps to the second as a twist. A snapshot of each (drive files, saved variables with their kinds, and every tab's folder and variables) must be equal.

</details>

---

## #114 feat: cd, environment, path, and restart setup steps

https://github.com/KyleBuildsAI/ship-it/pull/114

1. `windows().session().pathAdd('user', 'C:\\Program Files\\nodejs\\')`: does the open terminal find Node? Does a new one?
2. Why does setup code act as an administrator when the player can't?
3. Why does `pathAdd` keep the Path's expandable kind instead of saving it as plain text?

<details><summary>Answers</summary>

1. No, then yes. The terminal opened first copied the User Path before `nodejs` was added. A new terminal builds its Path from the saved scopes, which now include it.
2. Setup builds the starting world, like an IT department did before Kyle sat down. Missions need Machine-scope states (say, a Machine Path with Node on it) that the player can't create but can meet.
3. The stock User Path contains `%USERPROFILE%`. Saving it as plain text would stop that from expanding, a real Windows bug, not a starting state a mission wants by accident. Keeping the kind means only the added folder changes.

</details>

---

## #115 checkpoint: v1 testable

https://github.com/KyleBuildsAI/ship-it/pull/115

1. Why does `LAUNCH.bat` start with `cd /d "%~dp0"`?
2. Why doesn't `STOP.bat` just end whatever listens on port 18173?
3. When do you need `STOP.bat` at all?

<details><summary>Answers</summary>

1. A double-click, or a shortcut, can start a batch file in another folder. `%~dp0` is the batch file's own folder, and `/d` also switches the drive, so `npm` runs in the project.
2. Another program, or another copy of the repo, could be on that port. Matching node processes whose command line points into this folder ends only SHIP IT.
3. Only when the SHIP IT window is hidden or you've lost track of it. Closing that window stops everything too.

</details>

---

## #117 feat: variables in the lexer, and reading words as parameters and values

https://github.com/KyleBuildsAI/ship-it/pull/117

1. Why doesn't the lexer replace `$HOME` with `C:\Users\kyle` itself?
2. `'-Force'` and `-Force` have the same text after lexing. How does `toArgs()` tell them apart?
3. What would the parity test catch if someone changed how the new lexer handles `>>`?

<details><summary>Answers</summary>

1. The value depends on the terminal tab. Each tab has its own copy of the environment, and a `$env:` change in one tab doesn't reach the others. The lexer runs before that is known, so it only records the name, and the shell expands it.
2. Each word part remembers whether it came from quotes (or a backtick escape). Only a word whose first part is bare text starting with `-` and a letter becomes a parameter.
3. Any Act 2 solution line such as `echo "*.log" >> .gitignore` would lex differently from `tokenize()`, and that line's test case would fail. That shows Act 2 can't move to the new lexer until the difference is resolved.

</details>

---

## #116 feat: a powershell lexer with quotes, escapes, comments and operators

https://github.com/KyleBuildsAI/ship-it/pull/116

1. Why is `echo "a"b` two words but `echo a"b"` one word?
2. Why does each word part store `quoted`, when the quotes are already gone from its text?
3. `echo hi>>a.txt` and `echo hi >>a.txt`: which one writes a file?

<details><summary>Answers</summary>

1. PowerShell ends a word that *starts* with a quote at its closing quote, so whatever follows starts a new word. A word that starts bare keeps going through any quoted pieces. The test `ends a word that starts with a quote where the quote closes` checks the case that matters most: `cd "C:\Program Files"\nodejs` is refused by real PowerShell.
2. The parameter binder (next PR) needs it: an unquoted `-Force` is a parameter, but `'-Force'` and `` `-Force `` are plain text passed as a value.
3. `echo hi >>a.txt`. A `>` only redirects at the start of a token. Inside the word `hi>>a.txt` it's just a character, so the first command prints `hi>>a.txt`.

</details>

---

## #118 feat: a parameter binder that works in powershell's passes and speaks its errors

https://github.com/KyleBuildsAI/ship-it/pull/118

1. Why does `-fi` bind `-Filter` but `-file` bind `-File`?
2. In `Remove-Item -rf -Path`, which error does PowerShell report, and why that one?
3. Why is `-Force:false` refused, when `-Force:$false` works?

<details><summary>Answers</summary>

1. `-File` comes from the file system provider, not from `Get-ChildItem` itself. PowerShell tries a shortened name against the cmdlet's own parameters first, and `-fi` matches only `-Filter` there. `-file` is an exact name, and an exact name always wins.
2. `Missing an argument for parameter 'Path'`. PowerShell resolves names first, and `-Path` with nothing after it fails in that pass. The unknown `-rf` is only reported in the last pass.
3. `$false` is a boolean value. `false` without the `$` is just text, and a switch can't be set from text. Only `$true`, `$false`, `$null` or a number can set one.

</details>

---

## #119 feat: hints for combined unix flags and paths split at a space

https://github.com/KyleBuildsAI/ship-it/pull/119

1. Why does `rm -rr notes.txt` get no hint?
2. `Get-ChildItem C:\My Big Folder`: which word does PowerShell reject, and what does the hint suggest?
3. Why does `rm a -Force b` get no quotes hint?

<details><summary>Answers</summary>

1. Both letters point at the same switch (`-Recurse`), so they aren't two different Unix flags. Suggesting `-Recurse -Recurse` would be wrong.
2. `Folder`. `C:\My` fills `-Path` and `Big` fills `-Filter`, so nothing is left for `Folder`. The hint rebuilds all three words: `'C:\My Big Folder'`.
3. The switch sits between the words, so they can't be one path that split at a space. Only an unbroken run of values could be.

</details>

---

## #120 feat: number parameters convert like powershell's binder

https://github.com/KyleBuildsAI/ship-it/pull/120

1. What does `Stop-Process -Id 2.5` try to stop, and why?
2. Why does `Bound.numbers()` never see text like `node`?
3. What would go wrong if the binder used JavaScript's `Math.round`?

<details><summary>Answers</summary>

1. Process 2. PowerShell rounds half to even, and 2 is the even neighbour of 2.5.
2. `bind()` converts and checks every number before the cmdlet runs. If one fails, binding stops with PowerShell's error and the cmdlet never runs.
3. `Math.round(2.5)` is 3, so the sandbox would target a different process from real PowerShell.

</details>

---

## #121 docs: act 1 directs an in-game coding agent

https://github.com/KyleBuildsAI/ship-it/pull/121

1. Why is Otto scripted instead of a real LLM?
2. What makes an answer to a Check question right?
3. Why does a gate show effects worked out by a dry run, instead of text an author wrote?

<details><summary>Answers</summary>

1. The game must work with no API key, and every path must be testable. A scripted agent makes the same, deliberate, realistic mistakes every time, so the lessons are reliable. When a key exists, Sage only maps your own words onto one of the written plans.
2. Each option carries a claim the engine can check (like "notes landed in C:\Users\kyle"). The right answer is whichever claim is true in the sandbox right now, so grading stays by state.
3. Authored text could give the answer away or drift out of date. A dry run replays the line on a copy of the laptop and reports what really changed, the way a real agent's diff does.

</details>

---

## #122 feat: laptop sandboxes run powershell 7 with get-location and set-location

https://github.com/KyleBuildsAI/ship-it/pull/122

1. What decides whether a sandbox gets Act 2's commands or the PowerShell profile?
2. Why does `cd nope; cd quillwork` still move to `quillwork`?
3. Why does `cd notes.txt` name the path as typed, when `cd nope` shows the full path?

<details><summary>Answers</summary>

1. Whether the workspace has a machine. Only an Act 1 laptop sandbox (a setup that starts with `windows()`) has one; Act 2's sandboxes don't.
2. PowerShell runs each `;` statement in turn, and a failed `cd` is a non-terminating error, so the next statement still runs. The sandbox does the same.
3. That's what PowerShell 7.6 prints (captured in `error-cd-file.txt` and `error-cd-missing.txt`). The sandbox copies it rather than tidying it, because Kyle will see the real one.

</details>

---

## #123 fix: wildcard cd, cd.. and cd\, and one powershell per tab

https://github.com/KyleBuildsAI/ship-it/pull/123

1. Why does `cd *` fail when there are several folders?
2. What happens to the history step when `cd -` finds its folder deleted?
3. Why does the Shell look up the active tab on every call?

<details><summary>Answers</summary>

1. A terminal can stand in only one folder. PowerShell refuses: "resolved to multiple containers. You can only set the location to a single container at a time."
2. It's used up, as in PowerShell. The tab stays where it was, and the next `cd -` goes to the entry before.
3. You or Otto can switch tabs at any time. Each tab is a separate pwsh process, so a line must run in the tab that's active now.

</details>

---

## #124 feat: powershell's listing tables, with hidden and read-only attributes

https://github.com/KyleBuildsAI/ship-it/pull/124

1. Why does `.cache` show in a plain `ls` on the laptop, but AppData doesn't?
2. Why is `notes.txt` (containing `ship it` and a new line) 9 bytes, not 8?
3. What happens to a hidden folder's attribute when you delete the folder and make a new one with the same name?

<details><summary>Answers</summary>

1. On Windows, only the Hidden attribute hides an item; a name starting with a dot hides nothing. AppData has the attribute, and `.cache` doesn't.
2. Windows ends a line with two bytes, `\r\n`. So it's 7 letters and a space, plus 2 bytes for the line end.
3. It's gone. Deleting the folder forgets its attribute, so the new folder starts visible, as on Windows.

</details>

---

## #125 feat: get-childitem with wildcards, recursion, and env:

https://github.com/KyleBuildsAI/ship-it/pull/125

1. Why does `dir /s` fail in PowerShell when it works in cmd?
2. What's the difference between `ls quillwork -Depth 0` and `ls quillwork`?
3. `ls env:*PATH*` lists `HOMEPATH`, `Path` and `PATHEXT`. Why all three?

<details><summary>Answers</summary>

1. PowerShell's switches start with `-`. `/s` is read as a path, the folder `C:\s`, which doesn't exist. The PowerShell way is `Get-ChildItem -Recurse`.
2. Nothing in what's listed: both show only quillwork's own items. `-Depth 0` turns on recursion but allows zero levels down.
3. The wildcard matches `PATH` anywhere in the name, ignoring case, and all three names contain it.

</details>

---

## #126 fix: get-childitem declares all of powershell's parameters

https://github.com/KyleBuildsAI/ship-it/pull/126

1. Why does `ls -d` bind `-Depth` rather than `-Directory`?
2. Why refuse `-Include` instead of ignoring it?
3. What does `-Depth -1` print, and why?

<details><summary>Answers</summary>

1. `-Depth` belongs to Get-ChildItem itself, and `-Directory` comes from the file system provider. PowerShell tries a shortened name against the cmdlet's own parameters first.
2. Ignoring it would list more than you asked for and look right. A refusal is honest.
3. A binding error: the value is too small for a UInt32. A depth can't be negative.

</details>

---

## #127 feat: new-item, mkdir, and test-path

https://github.com/KyleBuildsAI/ship-it/pull/127

1. Why does `New-Item a\b\c.txt` fail but `New-Item -ItemType Directory a\b\c` work?
2. What does `New-Item notes.txt -Force` do to an existing `notes.txt`?
3. How can you check that `API_KEY` is set without printing it?

<details><summary>Answers</summary>

1. Making a folder on Windows makes any missing parents too. Making a file needs its folder to exist, unless `-Force` asks PowerShell to make it.
2. It replaces the file with an empty one. `-Force` means "overwrite", so the old text is gone.
3. `Test-Path Env:API_KEY` prints `True` or `False`, never the value.

</details>

---

## #128 fix: new-item refuses a file on the way and forbidden names

https://github.com/KyleBuildsAI/ship-it/pull/128

1. Why is `New-Item notes.txt\sub.txt` refused even with `-Force`?
2. What does `Test-Path Env:` answer, and why?
3. Why check for forbidden characters before creating anything?

<details><summary>Answers</summary>

1. `notes.txt` is a file, so nothing can live inside it. `-Force` makes missing folders, but it can't turn a file into one.
2. True. `Env:` is the root of the environment drive, and it always exists.
3. Otherwise part of the path could be made before a bad name fails, leaving half an operation behind.

</details>

---

## #129 feat: remove-item with powershell's confirm question

https://github.com/KyleBuildsAI/ship-it/pull/129

1. Why can't you delete a folder while a terminal tab stands inside it?
2. What's the difference between answering A and answering Y?
3. After `Remove-Item Env:TEMP`, does a new tab have TEMP?

<details><summary>Answers</summary>

1. On Windows, a process's current folder is in use and can't be deleted. Each tab is a pwsh process, so the sandbox refuses: `Cannot remove the item ... because it is in use.`
2. Y deletes this folder and asks again for the next one. A (Yes to All) deletes this one and every later one without asking.
3. Yes. `Remove-Item Env:TEMP` changes only this tab's copy. The saved User variable is untouched, and a new tab copies it again.

</details>

---

## #130 fix: remove-item declares all its parameters and keeps hidden or read-only items

https://github.com/KyleBuildsAI/ship-it/pull/130

1. Why is `rm -f notes.txt` refused?
2. After `rm tmp -Recurse` where `tmp` holds a hidden folder, what's left?
3. Why doesn't another tab's folder count as in use?

<details><summary>Answers</summary>

1. Remove-Item has both `-Filter` and `-Force`, so `-f` could mean either. PowerShell refuses ambiguous shortened names.
2. `tmp` with the hidden folder inside, now empty. The visible files are gone, the hidden folder stays with the access error, and so does `tmp`, because it isn't empty.
3. `Set-Location` only changes PowerShell's idea of where the tab is. The pwsh process's working folder doesn't move, so nothing holds the folder open.

</details>

---

## #132 feat: read-only machine queries for grading

https://github.com/KyleBuildsAI/ship-it/pull/132

1. Why does `list('Users/kyle')` include AppData, when a plain `dir` doesn't show it?
2. Why does `foldersFirstByName` compare names with an English collator instead of comparing lower-cased text with `<`, and why does it name the language?
3. You open a second tab, then close the first. What does `tabs()` return, and why isn't the remaining tab renumbered?

<details><summary>Answers</summary>

1. Grading checks what's really on the drive. The Hidden attribute only changes what a listing prints, and a hidden leftover still exists. `main` has the attribute (#124), so a `hidden` flag could be added, but no check needs one yet.
2. Real PowerShell 7.6 sorts by English language rules, so `_notes` and `~$plan.docx` come before `api`. Character codes would put `~` last, and the game teaches by showing what a real terminal prints. Naming the language matters because a collator with no language follows the computer's own settings, which could change the order from one machine to the next.
3. `[{ tab: 2, cwd: 'Users/kyle', active: true }]`. The terminal still calls that tab PS 2. If numbers shifted, a check like "tab 1 stays in the API" would suddenly be looking at a different tab.

</details>

---

## #133 feat: grade the laptop by folder, file, location, and variable

https://github.com/KyleBuildsAI/ship-it/pull/133

1. In the test laptop, PS 1 opened before `QUILL_ENV` was saved. With PS 1 active, which passes: `{ kind: 'envVar', name: 'QUILL_ENV' }`, or the same with `scope: 'newTerminal'`? Why?
2. Why does the checklist say "PORT is set in the active terminal, with the expected value" instead of "PORT is 4000"?
3. `C:\Users\kyle\quillwork\api` is a folder. What does `{ kind: 'driveFile', path: 'Users/kyle/quillwork/api', exists: false }` return, and why?

<details><summary>Answers</summary>

1. Only the `newTerminal` one. PS 1 copied its variables when it opened, before `QUILL_ENV` was saved, so the active tab doesn't have it. A terminal opened now would copy it.
2. A variable or a file can hold a secret, like an API key, and the checklist is on screen. The game can't tell which values are secret, so it never prints any. Content can add a `label` when a friendlier sentence is safe.
3. `true`. The check asks "is there no file here?", and a folder isn't a file. `driveFolder` works the same way the other way round.

</details>

---

## #134 feat: missions check the laptop, and play grades it

https://github.com/KyleBuildsAI/ship-it/pull/134

1. A drill's setup is `repo().commit(...)` and its success is `{ kind: 'driveFile', path: 'Users/kyle/a.txt' }`. What catches it, and when?
2. Why could `runner.ts` and every Act 2 test keep passing `gitQueries(ws)` unchanged?
3. Why does the schema reject `{ kind: 'envVar', name: 'PORT', equals: '' }`?

<details><summary>Answers</summary>

1. `validateAct` reports it: `"driveFile" checks the laptop, so the drill's setup must start with windows().` That runs in the content tests, so CI fails before anyone plays it. If it slipped through, this bare check would make `evaluate` throw `PredicateContextError`, because an Act 2 sandbox has no machine to ask. But inside an `all` or `any` that decides before reaching it, it would never run, and the drill would be graded quietly without it. That's why `validateAct` is the guard to trust.
2. `SandboxQueries` is `GitQueries` plus an optional `machine`, so a plain `GitQueries` object already fits. Only laptop checks need the machine.
3. Windows deletes a variable that's set to an empty value, so no variable can ever equal `''`. The check could never pass, which makes it a content bug the schema catches when the mission loads.

</details>

---

## #135 refactor: read an act's parts through require helpers

https://github.com/KyleBuildsAI/ship-it/pull/135

1. Why does `startBossFight` call `requireBoss` before `endDrill()` and `loadSandbox`?
2. Every Act still needs a boss. So why make `boss` optional in the shape at all?
3. What would break if `act2` were typed `Act` instead of `CompleteAct`?

<details><summary>Answers</summary>

1. So a missing boss throws before anything changes. If it threw after `loadSandbox`, the terminal would already show a new sandbox with no fight in it.
2. So the next PR can let an early-access Act leave it out by changing one rule. This PR moves every reader onto `requireBoss` first, while behaviour is unchanged and the tests prove it.
3. The Act 2 tests that read `act2.boss.timeLimitSeconds` or `act2.placementTest.drillIds` would stop compiling, because TypeScript would say those parts might be `undefined`.

</details>

---

## #136 refactor: an act can ship in early access

https://github.com/KyleBuildsAI/ship-it/pull/136

1. Why is a placement test not allowed while an Act is in early access?
2. Act 1 ships with Mission 1.1 and all five later titles in `upcoming`. What must change in `act.ts` when Mission 1.2 ships, and what catches a mistake?
3. Why does the save-rules test also run the same progress with `earlyAccess: false`?

<details><summary>Answers</summary>

1. Passing a placement test marks every mission in the Act as tested out and can complete the Act. In early access, some missions don't exist yet, so testing out would skip lessons nobody has played.
2. Add `'deletes-are-forever'` to `missionIds` and remove "Deletes Are Forever" from `upcoming`. If the title stays in `upcoming`, the Act counts 7 missions (2 shipped plus 5 upcoming), so the schema rejects it when it loads: "An Act has at most 6 missions, counting the upcoming ones." If a different title is removed by mistake, the count still fits, and `validateAct` reports that "Deletes Are Forever" has shipped, so it isn't upcoming.
3. To prove the early-access flag is what keeps the Act unfinished. If the finished version didn't complete either, the test would pass for the wrong reason, for example because some part was never recorded.

</details>

---

## #137 feat: the acts button recommends the first act with work left

https://github.com/KyleBuildsAI/ship-it/pull/137

1. Why does `recommendedAct` check both "not complete" and `hasWorkLeft`? Couldn't one of them do the job?
2. Act 1 is in early access with only Mission 1.1 built and no boss yet. The player has finished 1.1. Why doesn't the missing boss count as work left?
3. A player finished Mission 1.1, and a later PR ships Mission 1.2. Where does the Acts button open, and why is no save change needed?

<details><summary>Answers</summary>

1. Each covers a case the other misses. An early-access Act never completes, so only "work left" moves past it. A tested-out Act is complete but its boss was never fought, so `hasWorkLeft` says true, and only "complete" moves past it.
2. `hasWorkLeft` only counts a boss that exists (`act.boss !== undefined`). A boss that isn't built can't be played, so counting it would keep sending the player to an Act with nothing to do. Once the boss ships, it counts, and the button comes back to Act 1.
3. On Act 1. Mission 1.2 isn't done, so `hasWorkLeft` is true again. The recommendation is worked out from the content and the save on every click, so there's nothing stored to update.

</details>

---

## #138 docs: next ideas list every unmerged act 1 branch in merge order

https://github.com/KyleBuildsAI/ship-it/pull/138

1. Why must `feat/early-access-menu` merge before `refactor/schema-parts`?
2. What does item 2's `git rebase --onto` do?
3. Why is A17a on a `wip/` branch rather than a `feat/` one?

<details><summary>Answers</summary>

1. `refactor/schema-parts` is built on top of `feat/early-access-menu`. Its PR would show both changes, and could conflict, if the lower one wasn't in `main` first.
2. It takes the commits made after `9c84398` (the second batch) and replays them on top of the first batch's last branch, so the second batch sits on the first again after the first batch's PRs are squash-merged.
3. The session stopped before its lint, type and test checks ran. `wip/` says "not checked yet".

</details>

---

## #139 feat: roll out the act 1 machinery built so far

https://github.com/KyleBuildsAI/ship-it/pull/139

1. Why does this PR change nothing you can see in the game?
2. What does Otto's driver do that typing in the terminal doesn't?
3. Why does a dry run use a scratch copy of the laptop?

<details><summary>Answers</summary>

1. It adds the machinery Act 1's screens will use: grading, schemas, the driver, snapshots and replays. Nothing in the menu or world calls it yet; the next PR does.
2. It runs an action as data (a command, a Confirm answer, a file write, a new tab) and records exactly what happened, so the game can show, grade and replay it.
3. So the game can show what a risky command would do before Otto runs it for real, without touching the laptop you're playing on.

</details>

---

## #140 fix: two tabs opened together end with exactly one saving

https://github.com/KyleBuildsAI/ship-it/pull/140

1. Why did both tabs end up not saving before this fix?
2. What happens now when the older tab hears the newer tab's ask?
3. Why is a random `nonce` part of each ask?

<details><summary>Answers</summary>

1. Each tab heard the other's ask and agreed to hand over, or the older one stole the lock and then handed over anyway. Either way both stepped aside.
2. If it holds the save, it stores what's pending and lets go. If it's still waiting, it steps aside without taking the lock.
3. Two tabs could ask in the same instant. The random number breaks the tie the same way in both tabs.

</details>
