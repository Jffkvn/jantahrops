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

/**
 * WCAG AA requires 4.5:1 for body text. Every pair below is body text or
 * smaller, so 4.5 applies to all of them — there are no exceptions and no
 * lowered thresholds.
 *
 * Both modes run the SAME pair list, built here once. Earlier this file had two
 * hand-written lists that drifted: the dark block silently swapped
 * `highlight-ink / highlight` for a different, passing pair, which hid the fact
 * that the two tokens were identical and every amber button rendered invisible
 * text. A shared list makes that class of divergence impossible.
 */
const MIN_RATIO = 4.5;

const PAIRS: ReadonlyArray<readonly [fg: string, bg: string]> = [
  ['ink', 'canvas'],
  ['ink', 'surface'],
  ['ink-secondary', 'canvas'],
  ['ink-secondary', 'surface'],
  ['ink-muted', 'canvas'],
  ['ink-muted', 'surface'],
  ['primary-ink', 'primary'],
  ['sidebar-ink', 'sidebar'],
  ['highlight-ink', 'highlight'],
  ['highlight-soft-ink', 'highlight-soft'],
];

function runContrastSuite(mode: string, tokens: Record<string, string>) {
  describe(`WCAG Contrast Ratios — ${mode} (parsed from tokens.css)`, () => {
    it('parsed a non-empty token set', () => {
      expect(Object.keys(tokens).length).toBeGreaterThan(10);
    });

    for (const [fgName, bgName] of PAIRS) {
      it(`${fgName} on ${bgName} is at least ${MIN_RATIO}:1`, () => {
        const fg = tokens[fgName];
        const bg = tokens[bgName];
        // A missing token must fail loudly, never skip the assertion.
        expect(fg, `--${fgName} is not defined in the ${mode} block`).toBeDefined();
        expect(bg, `--${bgName} is not defined in the ${mode} block`).toBeDefined();

        const ratio = getContrastRatio(fg!, bg!);
        expect(
          ratio,
          `${fgName} (${fg!}) on ${bgName} (${bg!}) = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(MIN_RATIO);
      });
    }
  });
}

runContrastSuite('light', lightTokens);
runContrastSuite('dark', darkTokens);

describe('token hygiene', () => {
  it('never lets a solid surface and its ink be the same colour', () => {
    for (const [mode, tokens] of [
      ['light', lightTokens],
      ['dark', darkTokens],
    ] as const) {
      for (const [fgName, bgName] of PAIRS) {
        expect(
          tokens[fgName],
          `--${fgName} and --${bgName} are identical in ${mode} mode, which renders text invisible`,
        ).not.toBe(tokens[bgName]);
      }
    }
  });

  it('defines the same token names in both modes', () => {
    const lightKeys = Object.keys(lightTokens).sort();
    const darkKeys = Object.keys(darkTokens).sort();
    const missingInDark = lightKeys.filter((k) => !darkKeys.includes(k));
    expect(missingInDark, `tokens missing from .dark: ${missingInDark.join(', ')}`).toEqual([]);
  });
});
