import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { loadConfig } from './config';
import { consoleLogger as logger } from './logger';
import { createAnthropicMentor } from './mentor';
import { loadPrompts } from './prompts';
import { openUsageStore } from './usage';

// Sage, the local AI mentor server (DESIGN.md section 9). `npm run dev` starts it next to
// Vite, which forwards the game's /api requests here. The API key stays in this process.

const serverDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(serverDir, '..');

// quiet: dotenv otherwise prints a promo line on every start.
loadDotenv({ path: resolve(repoRoot, '.env'), quiet: true });

const config = loadConfig(process.env, logger);
const prompts = await loadPrompts(resolve(serverDir, 'prompts'));
const usage = await openUsageStore({
  filePath: resolve(serverDir, 'usage.json'),
  dailyCallCap: config.dailyCallCap,
  logger,
});

function createMentor(apiKey: string) {
  const client = new Anthropic({
    apiKey,
    // Pinned so a stray ANTHROPIC_BASE_URL or ANTHROPIC_AUTH_TOKEN in the shell can't send
    // the key somewhere else or swap credentials behind Kyle's back.
    baseURL: 'https://api.anthropic.com',
    authToken: null,
    // The browser gives up after 20 seconds. Answer (even with an error) before then, and
    // skip automatic retries, which would outlive the browser's wait.
    timeout: 18_000,
    maxRetries: 0,
  });
  return createAnthropicMentor({
    createMessage: (params) => client.messages.create(params),
    model: config.models.default,
    prompts,
    onUsage: (tokens) => {
      void usage.recordTokens(tokens);
    },
  });
}

const mentor = config.apiKey === null ? null : createMentor(config.apiKey);
const app = createApp({ models: config.models, usage, mentor, logger });

// 127.0.0.1, not 0.0.0.0: other devices on the network can't reach Sage at all.
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port }, (info) => {
  const keyState =
    mentor === null
      ? 'no ANTHROPIC_API_KEY, so Sage answers offline (the game still works)'
      : `model ${config.models.default}`;
  const { calls } = usage.current();
  logger.info(`Sage is listening on http://127.0.0.1:${String(info.port)} with ${keyState}.`);
  logger.info(`${String(calls)}/${String(config.dailyCallCap)} Sage calls used today.`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(
      `Port ${String(config.port)} is already in use. Stop the other process or set MENTOR_PORT in .env.`,
    );
  } else {
    logger.error(`Server error: ${error.message}`);
  }
  process.exitCode = 1;
});
