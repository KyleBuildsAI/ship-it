import { windows, type FixtureBuilder } from '../../engine/fixtures';

/*
 * Act 1's laptop (docs/act1-directed.md section 3.0): Kyle's Windows laptop with the
 * Quillwork API and web app under his home folder, and one PowerShell terminal open at home.
 * Paths are drive paths, from C:\ down.
 */

export const HOME = 'Users/kyle';
export const QW = `${HOME}/quillwork`;
export const API = `${QW}/api`;
export const WEB = `${QW}/web`;

const FILES: Readonly<Record<string, string>> = {
  [`${API}/package.json`]: '{\n  "name": "quillwork-api",\n  "version": "1.0.0"\n}\n',
  [`${API}/server.js`]: "require('dotenv').config();\nconsole.log('Quillwork API');\n",
  [`${API}/src/routes/notes.js`]: 'module.exports = [];\n',
  [`${API}/.env.example`]: 'PORT=\nDATABASE_URL=\nQUILL_API_KEY=\n',
  [`${API}/README.md`]: '# Quillwork API\n\nCopy .env.example to .env, then fill it in.\n',
  [`${WEB}/package.json`]: '{\n  "name": "quillwork-web",\n  "version": "1.0.0"\n}\n',
  [`${WEB}/index.html`]: '<!doctype html>\n<h1>Quillwork</h1>\n',
  [`${HOME}/Documents/todo.txt`]: 'Get the Quillwork API running.\n',
};

/** The laptop before anything has happened: the projects, and a terminal open at home. */
export function laptop(): FixtureBuilder {
  return windows().files(FILES).session();
}
