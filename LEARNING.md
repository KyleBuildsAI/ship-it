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
