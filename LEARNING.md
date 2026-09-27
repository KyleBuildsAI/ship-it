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
