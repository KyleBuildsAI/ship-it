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
