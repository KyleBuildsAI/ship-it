import { windows, type FixtureStep } from '../../engine/fixtures';

/**
 * Act 1's free-play laptop, opened from the Act 1 menu: a stock Windows laptop with one
 * PowerShell terminal open at home, and the Quillwork API project to look around in.
 * Nothing grades it. It's the laptop engine Act 1's missions will run on, to try today.
 */

const HOME = 'Users/kyle';
const API = `${HOME}/quillwork/api`;

export const LAPTOP_SANDBOX: readonly FixtureStep[] = windows()
  .files({
    [`${API}/package.json`]: '{\n  "name": "quillwork-api",\n  "version": "1.0.0"\n}\n',
    [`${API}/server.js`]: "require('dotenv').config();\nconsole.log('Quillwork API');\n",
    [`${API}/.env.example`]: 'PORT=\nLOG_LEVEL=\n',
    [`${API}/README.md`]: '# Quillwork API\n\nCopy .env.example to .env, then fill it in.\n',
    [`${HOME}/Documents/todo.txt`]: 'Get the Quillwork API running.\n',
  })
  .session()
  .toSpec();

/** What the terminal says when the laptop opens: what it is, and what to try. */
export const LAPTOP_NOTICE =
  'Act 1 laptop: real PowerShell on a Windows laptop. Try ls, cd quillwork\\api, ls -Force, mkdir notes, New-Item notes\\idea.txt, Test-Path notes, Remove-Item notes, Get-ChildItem Env:';
