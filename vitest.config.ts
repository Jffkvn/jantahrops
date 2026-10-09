import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // RLS tests need a service-role key and write to a real project, so they
    // are opt-in via `npm run test:rls` (vitest.rls.config.ts). They are
    // excluded here, never skipped there — see tests/rls/README.
    // supabase/functions run on Deno and are tested with `deno test`.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/rls/**', 'supabase/functions/**', 'netlify/**', '.kilo/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
