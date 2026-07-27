import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Font Files Integrity', () => {
  it('validates every .woff2 file in public/fonts/', () => {
    const fontsDir = path.resolve(__dirname, '../../public/fonts');
    const entries = fs.readdirSync(fontsDir);

    const woff2Files = entries.filter((file) => file.endsWith('.woff2'));
    expect(woff2Files.length).toBeGreaterThan(0);

    for (const fontFile of woff2Files) {
      const filePath = path.join(fontsDir, fontFile);
      const stats = fs.statSync(filePath);
      const buffer = fs.readFileSync(filePath);

      // Assert plausible file size (> 10 KB)
      expect(
        stats.size,
        `Font file ${fontFile} is suspiciously small (${stats.size} bytes)`,
      ).toBeGreaterThan(10_000);

      // Assert wOF2 magic bytes (77 4f 46 32 in hex)
      const magicBytes = buffer.subarray(0, 4).toString('hex');
      expect(
        magicBytes,
        `Font file ${fontFile} does not start with wOF2 magic bytes (got ${magicBytes})`,
      ).toBe('774f4632');
    }
  });
});
