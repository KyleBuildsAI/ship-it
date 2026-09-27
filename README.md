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

`npm run dev` starts two things side by side: the game (lines labeled `[web]`) and Sage, the optional AI mentor server (lines labeled `[sage]`). Open the URL Vite prints (usually `http://localhost:5173`) in Chrome.

To run only one half, use `npm run dev:web` (the game) or `npm run dev:server` (Sage).

The game renders with WebGPU and falls back to WebGL2 when WebGPU isn't available. The status badge in the top-left shows which one is running. To try the fallback on a WebGPU machine, add `?backend=webgl2` to the URL.

## Sage (optional AI mentor)

Sage is the game's mentor: a staff engineer at Quillwork AI who gives you hints and grades your clarifying questions, powered by Claude. Sage runs as a small server on your own computer (`server/`), so your Anthropic API key never reaches the browser.

Sage is optional. Without a key, and always on the GitHub Pages build, the game stays fully playable: the status badge shows `Sage: offline` and missions use their pre-written hints.

To turn Sage on, open a terminal in the repo folder:

1. Create your private settings file from the template and open it:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

2. In Notepad, paste your Anthropic API key right after `ANTHROPIC_API_KEY=` (no quotes, no spaces), then save and close. You can create a key in the Claude Console at platform.claude.com, under Settings, API keys. `.env` is gitignored, so the key stays on your machine. Never paste it into a chat, an issue, a commit, or any other file.

3. Optionally change the other settings in the same file. Blank means "use the default":

   | Variable | Default | What it does |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | none | Your key. Without it, Sage stays offline. |
   | `MENTOR_MODEL_DEFAULT` | `claude-sonnet-5` | Model for hints and question grading. |
   | `MENTOR_MODEL_INTERVIEW` | `claude-opus-5-5` | Model for interview mode (arrives in M5). |
   | `MENTOR_DAILY_CALL_CAP` | `50` | Hard stop: the most calls Sage makes per day. `0` switches Sage off. |
   | `MENTOR_PORT` | `18787` | Port Sage listens on, on `127.0.0.1` only. The game's `/api` proxy follows it. |
   | `MENTOR_BASE_URL` | none | Not supported yet. Sage ignores it and prints a warning. |

4. Start the game and Sage together:

   ```powershell
   npm run dev
   ```

   With a key in place, Sage prints `Sage is listening on http://127.0.0.1:18787 with model claude-sonnet-5.` and the in-game badge shows `Sage: online`. If you edit `.env` while it's running, press `Ctrl+C` and run `npm run dev` again.

How the cost guard works: every call to Anthropic counts against the daily cap. The count lives in `server/usage.json` (gitignored), so restarting doesn't reset it, and it starts over at your local midnight. Once the cap is hit, Sage goes offline for the rest of the day and the pre-written hints take over. The terminal shows the running count after each answer, like `hint answered (3/50 today)`.

Sage never helps during No-AI Drills or placement tests. The game doesn't ask, and the server refuses any request tagged with a drill.

Sage's voice and rules live in plain Markdown: `server/prompts/sage.md` (the persona), `hint.md`, and `grade_question.md`. Edit them freely; Sage restarts automatically when you save one.

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