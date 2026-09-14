// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.tsbuild/**',
      '**/coverage/**',
      'spikes/**',
      'packages/*/spikes/**',
      'packages/*/scripts/**',
      'eslint.config.js',
      'vitest.config.ts',
      'packages/*/vitest.config.ts',
      'packages/*/tsdown.config.ts',
      'examples/vitest.config.ts',
      'docs/vitest.config.ts',
      'scripts/vitest.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // `examples/tsconfig.json` and `scripts/tsconfig.json` are deliberately
        // not in root tsconfig.json's `references` array, so `tsc -b` (the
        // `typecheck` gate) never builds them — neither directory is a Bun
        // workspace package, and both resolve `@noblecloak/diagrammar-core` via the root
        // node_modules workspace symlink, not project references.
        // `projectService: true` discovers them anyway (it walks up from each
        // linted file looking for the nearest tsconfig, independent of the
        // `tsc -b` build graph), so eslint's type-aware rules still run over
        // `examples/**/*.ts` and `scripts/**/*.ts`.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // typescript-eslint's own type-aware checking supersedes this; the base
      // rule produces false positives on TS-only globals.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
