import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function getFilesRecursively(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx|css|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('No Hardcoded Colors in Codebase', () => {
  it('scans src/ for hex/rgb/hsl literals outside src/styles/', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const stylesDir = path.resolve(__dirname, '../../src/styles');
    const allFiles = getFilesRecursively(srcDir);

    const violations: { file: string; line: number; content: string }[] = [];

    // Regex for hex literals like #FFFFFF or #0B5978 outside comments
    const hexRegex = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/;
    const rgbRegex = /\brgba?\(/;
    const hslRegex = /\bhsla?\(/;

    for (const filePath of allFiles) {
      if (filePath.startsWith(stylesDir)) continue;

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n');

      lines.forEach((line, index) => {
        // Strip single line comments and multi line comment blocks
        const codeOnly = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

        if (hexRegex.test(codeOnly) || rgbRegex.test(codeOnly) || hslRegex.test(codeOnly)) {
          violations.push({
            file: path.relative(srcDir, filePath),
            line: index + 1,
            content: line.trim(),
          });
        }
      });
    }

    if (violations.length > 0) {
      const formattedViolations = violations
        .map((v) => `${v.file}:${v.line} -> ${v.content}`)
        .join('\n');
      expect.fail(`Found hardcoded color literals outside src/styles/:\n${formattedViolations}`);
    }

    expect(violations.length).toBe(0);
  });
});
