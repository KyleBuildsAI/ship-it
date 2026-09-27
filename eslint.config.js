import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      // Type-aware rules catch bugs plain syntax rules cannot, like a forgotten
      // `await` on renderer.init() (no-floating-promises).
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      // A one-line `if (x) return;` is fine, but a body on its own line needs braces,
      // so adding a second statement later can't silently fall outside the if.
      curly: ['error', 'multi-line'],
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // DESIGN.md section 13: the engine is pure. It never imports the game, UI, mentor,
    // content, three.js, or React. Everything else talks to the engine, not the reverse.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/game/**', '**/ui/**', '**/mentor/**', '**/content/**'],
              message: 'engine/ must not import from the game layers.',
            },
            {
              group: ['three', 'three/*', 'react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'engine/ is pure TypeScript: no rendering or UI libraries.',
            },
          ],
        },
      ],
    },
  },
  // Last, so it switches off every rule that would fight Prettier's formatting.
  prettier,
]);
