import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    // supabase/functions run on Deno (jsr: imports, Deno global) — a separate
    // runtime with its own toolchain, not part of the app's TS project.
    // supabase/functions run on Deno; tools/ are standalone one-off Node/Python
    // scripts. Neither belongs to the app's TS project, and type-aware rules
    // error out on any file no tsconfig claims.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'supabase/functions/**', 'tools/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // tests/ is included here too — it is covered by tsconfig.app.json, and
    // type-aware rules error out on any file no tsconfig claims.
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // RLS tests drive a raw, deliberately-untyped service-role client — they
    // test database behaviour at the PostgREST level, not the typed app client.
    // The unsafe-* rules only add noise there.
    files: ['tests/rls/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['*.js', '*.ts'],
    ignores: ['src/**'],
    ...tseslint.configs.disableTypeChecked,
  },
);
