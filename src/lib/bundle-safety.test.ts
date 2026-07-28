import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The service-role key bypasses every RLS policy in the database. Shipping it
 * in a browser bundle would hand any visitor unrestricted read and write access
 * to every table.
 *
 * This is the mistake with the worst consequences and the least visibility —
 * nothing about the running app would look wrong. So it is a test that runs
 * with every other test, not an item on a checklist someone remembers.
 *
 * The build output is checked only if it exists; `npm run build` in CI (and in
 * the acceptance steps) produces it.
 */
const distDir = path.resolve(__dirname, '../../dist');

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Decodes a JWT payload without verifying it — we only need the role claim. */
function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const padded = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
    const json = Buffer.from(padded, 'base64url').toString('utf8');
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

describe('build output safety', () => {
  const allFiles = walk(distDir).filter((f) => /\.(js|mjs|css|html|map)$/.test(f));
  // Sourcemaps embed dependency SOURCE, including Supabase's own JSDoc, which
  // says "Never expose your `service_role` key in the browser". Grepping maps
  // for the literal string therefore reports the warning text as a leak. Only
  // runtime assets are checked for the bare string; the JWT-claim check below
  // covers maps too and is the one that actually detects a key.
  const runtimeFiles = allFiles.filter((f) => !f.endsWith('.map'));

  it('ships no literal service_role string in runtime assets', () => {
    const offenders = runtimeFiles.filter((f) => fs.readFileSync(f, 'utf8').includes('service_role'));
    expect(offenders, `service_role found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every JWT in the build carries the anon role and nothing else', () => {
    // Stronger than "no service_role": any token that is not anon — a user
    // access token, a stray personal token — has no business being baked into
    // a build artefact.
    const offenders: string[] = [];

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const token of content.match(JWT_PATTERN) ?? []) {
        const role = jwtRole(token);
        if (role !== null && role !== 'anon') {
          offenders.push(`${path.basename(file)} (role=${role})`);
        }
      }
    }

    expect(offenders, `non-anon JWT found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('never commits a real key to .env.example', () => {
    const examplePath = path.resolve(__dirname, '../../.env.example');
    const content = fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '';
    expect(content).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
  });
});
