# SHIP IT

SHIP IT is a 3D browser game that is also a complete course in professional software engineering. You join Quillwork AI, a fictional AI startup, as an intern and rank up to Staff engineer by learning Git, GitHub team workflow, testing and CI, how systems work, AI-native engineering, and interview prep. Every Git concept is a physical place you can see (the Workbench, the Loading Dock, the Vault), every command you type animates the world, and every mission is graded by the state you reach, not the exact commands you typed. The full spec lives in [DESIGN.md](DESIGN.md).

## Status

Milestone 1 (Act 2: Git Core vertical slice) is in progress. See [DESIGN.md](DESIGN.md) section 15.

## How to run

Requirements: Windows 11 with PowerShell, Node.js 24 LTS or newer, npm, and Chrome.

Open a terminal in the repo folder, then:

```powershell
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`) in Chrome.

The Sage mentor is optional. To enable it, copy `.env.example` to `.env` and fill in the values. Without a key, the game stays fully playable with pre-written hints.

## Checks

Before opening a pull request, run every local quality gate in one command:

```powershell
npm run check
```

It runs these in order and stops at the first failure:

| Script | What it does |
|---|---|
| `npm run lint` | ESLint with type-aware rules. Fails on any warning. |
| `npm run format:check` | Prettier formatting check. `npm run format` fixes it. |
| `npm run typecheck` | TypeScript strict compile, no output files. |
| `npm run test:coverage` | Vitest unit tests with a coverage report in `coverage/`. `npm test` runs them without coverage. |
| `npm run build` | Production build into `dist/`, using the `/ship-it/` base path for GitHub Pages. |
| `npm run e2e` | Playwright smoke test in your installed Chrome against the build in `dist/`. Run `npm run build` first. |

To see the production build exactly as Pages will serve it, run `npm run preview` after a build and open `http://localhost:4173/ship-it/`.

## CI and deploys

Every pull request and every push to `main` runs [CI](.github/workflows/ci.yml): the same gates as `npm run check`, plus a gitleaks scan of the full history for committed secrets. When CI passes on `main`, the [deploy workflow](.github/workflows/deploy.yml) builds that exact commit and publishes it to https://kylebuildsai.github.io/ship-it/.