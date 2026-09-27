# SHIP IT

SHIP IT is a 3D browser game that is also a complete course in professional software engineering. You join Quillwork AI, a fictional AI startup, as an intern and rank up to Staff engineer by learning Git, GitHub team workflow, testing and CI, how systems work, AI-native engineering, and interview prep. Every Git concept is a physical place you can see (the Workbench, the Loading Dock, the Vault), every command you type animates the world, and every mission is graded by the state you reach, not the exact commands you typed. The full spec lives in [DESIGN.md](DESIGN.md).

## Status

Milestone 1 is complete: Act 2, Git Core, is playable from start to finish. Play it at https://kylebuildsai.github.io/ship-it/ (Sage is offline there; every hint still works) or run it locally below. See [DESIGN.md](DESIGN.md) section 15 for the roadmap.

## Start SHIP IT (the easy way)

Double-click **`start-ship-it.bat`** in the repo folder.

- The first time, it installs the packages (a minute or two). It also repairs them if a later `git pull` brought new ones.
- It starts the game and Sage, then opens Chrome at http://localhost:18173 by itself.
- Keep its window open while you play. To stop, close the window, or press `Ctrl+C` in it and then `Y`.
- Double-clicking it again while the game is running opens SHIP IT in a new Chrome tab, and that tab takes over your save. Any older SHIP IT tab says so and stops saving, so you can close it.
- If the folder is on a work-in-progress branch (not `main`), it warns you first, because playing unfinished code uses your real save.

For a desktop icon, right-click `start-ship-it.bat`, then **Show more options**, then **Send to**, then **Desktop (create shortcut)**. Keep the file itself in the repo folder.

### Does it save my progress?

Yes, automatically, in Chrome's storage for this game (IndexedDB). Closing Chrome, closing the launcher, or rebooting loses nothing.

- Every finished step, drill, mission, placement test, boss, and Field Mission check is saved the moment it happens. Settings save within half a second.
- Only one tab saves at a time: the newest one. An older SHIP IT tab hands over, stores anything still pending, and shows "SHIP IT is open in another tab". **Play here instead** takes the save back. This stops two tabs from overwriting each other.
- A mission you leave halfway starts again from its briefing next time, with a fresh Workbench. Steps you already finished don't pay XP twice.
- The save belongs to **this Chrome profile at this address**. The launcher always opens http://localhost:18173, and the game never runs on any other port. The online version (https://kylebuildsai.github.io/ship-it/), `127.0.0.1` instead of `localhost`, another browser, and Incognito windows each keep their own separate save.
- Clearing Chrome's "Cookies and other site data" deletes the save. Now and then, use **Settings, Export save** for a backup; **Import save** brings it back, on this computer or another.

## How to run

Requirements: Windows 11 with PowerShell, Node.js 24 LTS or newer, npm, and Chrome.

Open a terminal in the repo folder, then:

```powershell
npm install
npm run dev
```

`npm run dev` starts two things side by side: the game (lines labeled `[web]`) and Sage, the optional AI mentor server (lines labeled `[sage]`). Then open http://localhost:18173 in Chrome. The game always uses this address, because your save is tied to it: if something else holds the port, it stops with a message instead of moving to another one.

To run only one half, use `npm run dev:web` (the game) or `npm run dev:server` (Sage).

The game renders with WebGPU and falls back to WebGL2 when WebGPU isn't available. The status badge in the top-left shows which one is running. To try the fallback on a WebGPU machine, add `?backend=webgl2` to the URL.

## How to play

- **First time?** A short tutorial at the top left teaches the controls by having you use them: walk, jump, look around, run a command, hide and show the terminal, then step into an Act. Each step moves on by itself once you've done it. **Skip tutorial** ends it; **Settings, Replay tutorial** runs it again.
- **Move:** WASD or the arrow keys, or click the ground to walk there. Space jumps. Drag to look around.
- **Terminal:** `` Ctrl+` `` opens and closes it. It speaks PowerShell (`ls`, `cat`, `echo x > file`, `code file`) and git.
- **Act 2:** walk through the glowing Act 2 portal on Campus, or press **Act 2** at the bottom left.
  - **Placement test:** already know git? Score 85% on 12 timed drills to test out of the Act.
  - **Missions 2.1-2.5:** a short briefing, then guided steps with a live checklist and a three-rung hint ladder, then timed No-AI Drills, then a Question Round with Marco's vague ticket.
  - **Boss, The Dirty Tree:** Dex deploys from a clean checkout in 3:00. Commit the right things before he does.
  - **Field Mission:** clean the dirty tree on your real SandCastles repo, then paste PowerShell output to verify it.
- **The Git World mirrors your repo:** files are crates on the Workbench, `git add` moves them to the Loading Dock, `git commit` seals them into the Vault, and commits become platforms behind it. Click anything there to see the git command it maps to.
- **Standup** brings back drills you missed, spaced out so they stick. **Trophies** shows your rank and stats. **Settings** has text size, reduced motion, graphics quality, Sage on or off, the tutorial, and your save file.
- **Music:** calm classical pieces play after your first click or key press (browsers block sound until then). **♪ Music** at the bottom left mutes and unmutes. **Settings** has the volume, what's playing, and the credits. The music pauses while the tab is hidden, and needs an internet connection: the recordings stream from Wikimedia Commons.
- **Your progress saves itself** in the browser (IndexedDB) after every step. Settings, Export save gives you a backup file; Import save brings it back.

## Music credits

The game streams these recordings from [Wikimedia Commons](https://commons.wikimedia.org/). None are stored in this repo. Each license below covers the recording itself; the compositions are all long in the public domain.

| Piece | Performer | License |
|---|---|---|
| J. S. Bach, [Prelude No. 1 in C major, BWV 846](https://commons.wikimedia.org/wiki/File:Kimiko_Ishizaka_-_Bach_-_Well-Tempered_Clavier,_Book_1_-_01_Prelude_No._1_in_C_major,_BWV_846.ogg) | Kimiko Ishizaka (Open Well-Tempered Clavier) | CC0 1.0 |
| J. S. Bach, [Goldberg Variations: Aria](https://commons.wikimedia.org/wiki/File:Goldberg_Variations_01_Aria.ogg) | Kimiko Ishizaka (Open Goldberg Variations) | CC0 1.0 |
| J. S. Bach, [Air on the G String](https://commons.wikimedia.org/wiki/File:Air_-_Air_Force_Strings_-_United_States_Air_Force_Band.mp3) | United States Air Force Band, Air Force Strings | Public domain |
| Erik Satie, [Gymnopédie No. 1](https://commons.wikimedia.org/wiki/File:Erik_Satie_-_gymnopedies_-_la_1_ere._lent_et_douloureux.ogg) | Robin Alciatore (Musopen) | Public domain |
| Claude Debussy, [Clair de lune](https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg) | Laurens Goedhart | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Johann Pachelbel, [Canon in D](https://commons.wikimedia.org/wiki/File:Canon_(2004)_-_Strolling_Strings_-_United_States_Air_Force_Band.mp3) (arranged by Frank Hudson) | United States Air Force Band, Strolling Strings | Public domain |
| Frédéric Chopin, [Nocturne Op. 9 No. 2](https://commons.wikimedia.org/wiki/File:Chopin_-_Nocturne_No._2_in_E-flat_major,_Op._9_No._2_(Frank_Levy).flac) | Frank Lévy (Musopen, Set Chopin Free) | Public domain |
| Edvard Grieg, [Morning Mood](https://commons.wikimedia.org/wiki/File:Musopen_-_Morning.ogg) | Czech National Symphony Orchestra (Musopen) | Public domain |
| Robert Schumann, [Träumerei](https://commons.wikimedia.org/wiki/File:Robert_Schumann_-_scenes_from_childhood,_op._15_-_vii._dreaming.ogg) | Donald Betts (Musopen) | Public domain |
| W. A. Mozart, [String Quartet No. 19, K. 465: Andante cantabile](https://commons.wikimedia.org/wiki/File:Mozart_-_String_Quartet_No._19_in_C_major,_K465_%27Dissonance%27_-_II._Andante_cantabile_(Musopen_String_Quartet).flac) | Musopen String Quartet | Public domain |

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
| `npm run e2e` | Playwright end-to-end tests in your installed Chrome against the build in `dist/`: boot, terminal, editor, walking, playing a step, reload, and save export/import. Run `npm run build` first. |

To see the production build exactly as Pages will serve it, run `npm run preview` after a build and open `http://localhost:4173/ship-it/`.

## CI and deploys

Every pull request and every push to `main` runs [CI](.github/workflows/ci.yml): the same gates as `npm run check`, plus a gitleaks scan of the full history for committed secrets. When CI passes on `main`, the [deploy workflow](.github/workflows/deploy.yml) builds that exact commit and publishes it to https://kylebuildsai.github.io/ship-it/.

## Troubleshooting

- **The game won't start: "EACCES" or "Port 18173 is already in use".** Another program, or a Windows reservation, holds the game's port. Close the other program (maybe a second SHIP IT window), or restart the computer. See Windows' reserved ranges with `netsh interface ipv4 show excludedportrange protocol=tcp`. The game doesn't move to another port, because your save is tied to this one.
- **Sage says a port is reserved (EACCES).** Windows reserves blocks of ports for Hyper-V and WSL. See them with `netsh interface ipv4 show excludedportrange protocol=tcp`, then set `MENTOR_PORT` in `.env` to a port outside every range.
- **The badge says WebGL2 fallback.** WebGPU isn't available in this browser or on this GPU driver. The game works the same; update Chrome and your NVIDIA driver to get WebGPU back.
- **"Your save could not be read."** The save is kept untouched. Open Settings to import a backup, or Start over.
