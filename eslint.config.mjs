import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * `next lint` was removed in Next 16, so ESLint runs on its own (`pnpm lint`)
 * and is a blocking CI job.
 *
 * The repo-specific guardrails live in two places on purpose:
 *   - here, for anything expressible as an import or syntax restriction;
 *   - tooling/scripts/check-tokens.ts, for text-level rules that also need to
 *     cover CSS and JSON (raw hex, emoji, the hard-coded brand name).
 */
export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'storybook-static/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    /*
     * Pinned explicitly. eslint-plugin-react's auto-detection calls
     * `context.getFilename()`, removed in ESLint 10, and crashes the run.
     * Stating the version skips that code path entirely.
     */
    settings: { react: { version: '19.2' } },
    rules: {
      // §0.6 of the brief: no `any`, ever.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  /*
   * The service_role Supabase client bypasses RLS entirely (§8). It may only be
   * imported by route handlers and edge functions — never by a component, a page
   * or anything that could end up in a client bundle.
   */
  {
    files: ['app/**/*.tsx', 'components/**/*.tsx', 'lib/**/*.ts'],
    ignores: ['app/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/supabase/admin', '@/lib/supabase/admin'],
              message:
                'The service_role client bypasses RLS. Import it only from app/api/** or supabase/functions/**.',
            },
          ],
        },
      ],
    },
  },

  /* Tooling scripts are Node programs: they are allowed to write to stdout.
     Config files legitimately export an anonymous object or array. */
  {
    files: ['tooling/**/*.ts', '*.config.*', 'eslint.config.mjs'],
    rules: {
      'no-console': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
]
