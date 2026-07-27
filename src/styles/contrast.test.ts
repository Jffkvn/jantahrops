import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '').trim();
  const num = parseInt(cleanHex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getLuminance([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map((v) => {
    const srgb = v / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (a[0] ?? 0) + 0.7152 * (a[1] ?? 0) + 0.0722 * (a[2] ?? 0);
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hexToRgb(hex1));
  const l2 = getLuminance(hexToRgb(hex2));
  const max = Math.max(l1, l2);
  const min = Math.min(l1, l2);
  return (max + 0.05) / (min + 0.05);
}

export function parseCssTokens(cssContent: string) {
  const parseBlock = (blockStr: string) => {
    const tokens: Record<string, string> = {};
    const regex = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g;
    let match;
    while ((match = regex.exec(blockStr)) !== null) {
      if (match[1] && match[2]) {
        tokens[match[1]] = match[2].toUpperCase();
      }
    }
    return tokens;
  };

  const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/);
  const darkMatch = cssContent.match(/\.dark\s*\{([^}]+)\}/);

  const lightTokens = rootMatch ? parseBlock(rootMatch[1]!) : {};
  const darkTokens = darkMatch ? parseBlock(darkMatch[1]!) : {};

  return { lightTokens, darkTokens };
}

const tokensCssPath = path.resolve(__dirname, './tokens.css');
const cssContent = fs.readFileSync(tokensCssPath, 'utf8');
const { lightTokens, darkTokens } = parseCssTokens(cssContent);

describe('WCAG Contrast Ratios (Light Mode - Parsed from tokens.css)', () => {
  const pairs = [
    { name: 'ink / canvas', fg: lightTokens['ink']!, bg: lightTokens['canvas']!, min: 4.5 },
    { name: 'ink / surface', fg: lightTokens['ink']!, bg: lightTokens['surface']!, min: 4.5 },
    { name: 'ink-secondary / canvas', fg: lightTokens['ink-secondary']!, bg: lightTokens['canvas']!, min: 4.5 },
    { name: 'ink-muted / canvas', fg: lightTokens['ink-muted']!, bg: lightTokens['canvas']!, min: 4.5 },
    { name: 'ink-muted / surface', fg: lightTokens['ink-muted']!, bg: lightTokens['surface']!, min: 4.5 },
    { name: 'primary-ink / primary', fg: lightTokens['primary-ink']!, bg: lightTokens['primary']!, min: 4.5 },
    { name: 'highlight-ink / highlight', fg: lightTokens['highlight-ink']!, bg: lightTokens['highlight']!, min: 4.5 },
    { name: 'highlight-ink / highlight-soft', fg: lightTokens['highlight-ink']!, bg: lightTokens['highlight-soft']!, min: 4.5 },
  ];

  for (const { name, fg, bg, min } of pairs) {
    it(`asserts ${name} (${fg} on ${bg}) contrast ratio >= ${min}:1`, () => {
      expect(fg).toBeDefined();
      expect(bg).toBeDefined();
      const ratio = getContrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(min);
    });
  }
});

describe('WCAG Contrast Ratios (Dark Mode - Parsed from tokens.css)', () => {
  const pairs = [
    { name: 'ink / canvas', fg: darkTokens['ink']!, bg: darkTokens['canvas']!, min: 4.5 },
    { name: 'ink / surface', fg: darkTokens['ink']!, bg: darkTokens['surface']!, min: 4.5 },
    { name: 'ink-secondary / canvas', fg: darkTokens['ink-secondary']!, bg: darkTokens['canvas']!, min: 4.5 },
    { name: 'ink-muted / canvas', fg: darkTokens['ink-muted']!, bg: darkTokens['canvas']!, min: 4.5 },
    { name: 'ink-muted / surface', fg: darkTokens['ink-muted']!, bg: darkTokens['surface']!, min: 4.5 },
    { name: 'primary-ink / primary', fg: darkTokens['primary-ink']!, bg: darkTokens['primary']!, min: 4.5 },
    { name: 'primary-ink / highlight', fg: darkTokens['primary-ink']!, bg: darkTokens['highlight']!, min: 4.5 },
    { name: 'highlight-ink / highlight-soft', fg: darkTokens['highlight-ink']!, bg: darkTokens['highlight-soft']!, min: 4.5 },
  ];

  for (const { name, fg, bg, min } of pairs) {
    it(`asserts ${name} (${fg} on ${bg}) contrast ratio >= ${min}:1`, () => {
      expect(fg).toBeDefined();
      expect(bg).toBeDefined();
      const ratio = getContrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(min);
    });
  }
});
