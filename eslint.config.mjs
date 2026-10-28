import tsPlugin from '@typescript-eslint/eslint-plugin';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import { defineConfig, globalIgnores } from 'eslint/config';

// Flat-config port of the old .eslintrc.js. Next.js 16 removed `next lint`
// and `eslint-config-next` 16 ships flat configs only.
//
// `core-web-vitals` already registers the `import`, `react`, `react-hooks`,
// `jsx-a11y`, `@next/next` and `@typescript-eslint` plugins and the
// TypeScript parser, so this file only layers the same extras on top that the
// old config had. Prettier stays last so it can switch off formatting rules.
export default defineConfig([
  globalIgnores([
    '.next/**',
    '.open-next/**',
    '.wrangler/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
  ]),
  ...nextCoreWebVitals,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: Object.assign(
      {},
      ...tsPlugin.configs['flat/recommended'].map((c) => c.rules ?? {}),
    ),
  },
  {
    rules: {
      // New in the React Hooks plugin that eslint-config-next 16 bundles (the
      // React Compiler rules). Existing effects trip them in 13 components;
      // fixing those changes component behaviour, so it is tracked separately
      // from the framework upgrade. Warnings keep them visible meanwhile.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
          pathGroups: [
            { pattern: '@/**', group: 'internal', position: 'after' },
          ],
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
  },
  prettierRecommended,
]);
