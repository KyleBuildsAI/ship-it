import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin, type ProxyOptions } from 'vite';
import { defineConfig } from 'vitest/config';
// With the .ts extension, because Vite's upcoming native config loader requires one.
import { DEFAULT_PORT, GAME_PORT, PREVIEW_PORT, parsePort } from './server/port.ts';

// GitHub Pages serves this repo from https://kylebuildsai.github.io/ship-it/, so
// production builds need that path prefix or every asset URL 404s. `vite preview`
// serves the production build, so it must use the same prefix. Dev stays at "/".
const PAGES_BASE = '/ship-it/';

/**
 * Where Sage listens. MENTOR_PORT goes through the server's own parser, so a typo in .env
 * sends the proxy to the same fallback port Sage uses (Sage prints the warning).
 */
function sageUrl(mode: string): string {
  const raw = loadEnv(mode, process.cwd(), 'MENTOR_PORT').MENTOR_PORT;
  return `http://127.0.0.1:${String(parsePort(raw) ?? DEFAULT_PORT)}`;
}

// When the Sage server isn't running (say, only `npm run dev:web`), answer the game the way
// Sage answers without a key: offline. Status 200 on purpose, because Chrome logs every
// 4xx/5xx response as a console error and DESIGN.md section 14 wants a clean console.
// Vite still prints the proxy error in the terminal, where it's useful.
const answerOfflineWhenSageIsDown: ProxyOptions['configure'] = (proxy) => {
  proxy.on('error', (_error, _request, response) => {
    if (!('writeHead' in response) || response.headersSent) return;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ offline: true, error: 'The Sage server is not running.' }));
  });
};

/**
 * Answers /__ship-it/checkout with this checkout's folder, in dev only. start-ship-it.bat
 * uses it to tell "SHIP IT from this folder is already running" apart from any other app
 * (or another copy of the repo) holding the port.
 */
function identifyCheckout(): Plugin {
  return {
    name: 'ship-it-identify-checkout',
    configureServer(server) {
      server.middlewares.use('/__ship-it/checkout', (_request, response) => {
        response.setHeader('content-type', 'text/plain; charset=utf-8');
        response.end(process.cwd());
      });
    },
  };
}

/** A file in any Act's content folder, src/content/act1/ to act8/. */
const ACT_CONTENT = /\/src\/content\/act\d+\//;

/** An Act's index.ts: what lazyActs.ts loads with import(), so it starts that Act's own file. */
const ACT_INDEX = /\/src\/content\/act\d+\/index\.ts$/;

/**
 * Act 1's free-play laptop, and shared.ts that builds it, open from the first screen (the
 * preview menu), so they may load up front. They're a few kB, not an Act's content.
 */
const ACT_FILES_ALLOWED_UP_FRONT = ['/src/content/act1/laptop.ts', '/src/content/act1/shared.ts'];

/** The parts of a built chunk the guard reads. Rolldown's own chunk type has these and more. */
interface BuiltChunk {
  readonly fileName: string;
  readonly isEntry: boolean;
  /** The module this chunk was made for, when it's an entry or what an import() loads. */
  readonly facadeModuleId: string | null;
  /** Chunks this one imports statically: the browser fetches them along with it. */
  readonly imports: readonly string[];
  /** Chunks this one can fetch later with import(), like the 3D world or the code editor. */
  readonly dynamicImports: readonly string[];
  readonly moduleIds: readonly string[];
}

/** Module ids use backslashes on Windows. The patterns above are written with "/". */
function withSlashes(id: string): string {
  return id.replaceAll('\\', '/');
}

/** Whether `chunk` is an Act's own file, the one lazyActs.ts's import() of that Act loads. */
function isActFile(chunk: BuiltChunk): boolean {
  return chunk.facadeModuleId !== null && ACT_INDEX.test(withSlashes(chunk.facadeModuleId));
}

/**
 * Every chunk the game can download without asking for an Act: the entry, everything it
 * imports, and everything those fetch later with import(). That takes in the 3D world, which
 * main.tsx fetches as soon as the page loads, and the code editor. The one door it doesn't
 * go through is an import() of an Act's own file, the way lazyActs.ts loads an Act.
 */
function downloadsWithoutAnAct(chunks: readonly BuiltChunk[]): BuiltChunk[] {
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const found = new Map<string, BuiltChunk>();
  const toVisit = chunks.filter((chunk) => chunk.isEntry);
  for (let chunk = toVisit.pop(); chunk !== undefined; chunk = toVisit.pop()) {
    if (found.has(chunk.fileName)) continue;
    found.set(chunk.fileName, chunk);
    for (const fileName of chunk.imports) {
      const imported = byFileName.get(fileName);
      if (imported !== undefined) toVisit.push(imported);
    }
    for (const fileName of chunk.dynamicImports) {
      const loaded = byFileName.get(fileName);
      if (loaded !== undefined && !isActFile(loaded)) toVisit.push(loaded);
    }
  }
  return [...found.values()];
}

/** A module id as a path from the repo, for messages: src/content/act2/index.ts. */
function fromRepo(id: string): string {
  const path = withSlashes(id);
  return path.slice(path.indexOf('/src/') + 1);
}

/**
 * Fails the build if any Act's content could download before the game asks for that Act.
 * The game reaches each Act only through an import() in src/content/lazyActs.ts, which the
 * build turns into a file of its own. One static import of an Act's folder, even through a
 * chain of other files, would quietly pull that Act into the first download, or into the
 * 3D world's file, which downloads at startup too. A lint rule sees one file's imports at a
 * time; this reads the real build output, so it catches a chain too.
 */
function keepActContentLazy(): Plugin {
  return {
    name: 'ship-it-keep-act-content-lazy',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((file) => (file.type === 'chunk' ? [file] : []));
      const upFront = new Set(downloadsWithoutAnAct(chunks).flatMap((chunk) => chunk.moduleIds));
      const leaked = [...upFront].filter((id) => {
        const path = withSlashes(id);
        return (
          ACT_CONTENT.test(path) && !ACT_FILES_ALLOWED_UP_FRONT.some((ok) => path.endsWith(ok))
        );
      });
      if (leaked.length === 0) return;
      // Name where the content comes in: each leaked file imported by an up-front file that
      // isn't leaked content itself. Its own imports follow it in, so they aren't listed.
      const doors = leaked.flatMap((id) => {
        const importers = this.getModuleInfo(id)?.importers ?? [];
        const from = importers.filter(
          (importer) => upFront.has(importer) && !leaked.includes(importer),
        );
        return from.map((importer) => `  ${fromRepo(id)}, imported by ${fromRepo(importer)}`);
      });
      this.error(
        [
          'Act content would download before the game asks for its Act:',
          ...(doors.length > 0 ? doors : leaked.map((id) => `  ${fromRepo(id)}`)),
          'Reach an Act only through the import() calls in src/content/lazyActs.ts.',
        ].join('\n'),
      );
    },
  };
}

export default defineConfig(({ command, mode, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [react(), identifyCheckout(), keepActContentLazy()],
  server: {
    // Always the same port, never a fallback: the save lives in the browser under this exact
    // address, so another port would open an empty game. Better to fail loudly.
    port: GAME_PORT,
    strictPort: true,
    // The game calls /api/...; in dev, Vite forwards those to the local Sage server.
    proxy: {
      '/api': { target: sageUrl(mode), configure: answerOfflineWhenSageIsDown },
    },
  },
  // Fixed like dev, so the e2e tests always find the build where they expect it.
  preview: { port: PREVIEW_PORT, strictPort: true },
  resolve: {
    // three.js addons import from 'three'. Point that at the WebGPU build our code uses,
    // so only one copy of the three.js core loads (two copies break instanceof checks).
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }],
  },
  build: {
    // The three.js WebGPU core alone is over the 500 kB default. It loads in its own
    // lazy chunk after the HUD, so the warning would only be noise. The main chunk is
    // about 1,100 kB now that each Act's content is a file of its own (keepActContentLazy
    // keeps it that way), so this warns once main grows by a few more screens of UI.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    // Vitest blanks CSS by default; a layout test reads theme.css's numbers (panelLayout.test.ts).
    css: { include: [/theme\.css/] },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      // Entry points only wire real modules together; the modules they wire are tested.
      exclude: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'src/main.tsx', 'server/index.ts'],
      reporter: ['text', 'html'],
      // CLAUDE.md: the engine is graded like production code. Dropping below 90% fails the run.
      thresholds: {
        'src/engine/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
}));
