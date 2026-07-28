import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Opt-in RLS suite. Run with `npm run test:rls`.
 *
 * Separate from the default config because these tests talk to a real Supabase
 * project using a service-role key. They are excluded from `npm run check` so
 * routine runs never need that credential — but when they DO run, missing
 * credentials throw rather than skip. A skipped security test reads exactly
 * like a passing one, which is the failure mode this arrangement avoids.
 */

/** Minimal .env reader — avoids pulling in a dependency for three variables. */
function loadEnvFile(file: string): Record<string, string> {
  const full = path.resolve(__dirname, file);
  if (!fs.existsSync(full)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    globals: true,
    // Sequential: these tests share three users and mutate their rows.
    fileParallelism: false,
    testTimeout: 30_000,
    env: loadEnvFile('.env.rls.local'),
  },
});
