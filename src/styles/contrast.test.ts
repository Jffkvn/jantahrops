import { describe, it, expect } from 'vitest';

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
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

const lightTokens = {
  canvas: '#F4F6F8',
  surface: '#FFFFFF',
  ink: '#0D2B37',
  inkSecondary: '#48626F',
  inkMuted: '#7A919D',
  primary: '#0B5978',
  primaryInk: '#FFFFFF',
  highlight: '#F2B33D',
  highlightSoft: '#FDF4E2',
  highlightInk: '#6B4A05',
};

const darkTokens = {
  canvas: '#0A141A',
  surface: '#101E26',
  ink: '#E7EEF2',
  inkSecondary: '#9DB4C0',
  inkMuted: '#6E8896',
  primary: '#2C8FB5',
  primaryInk: '#0A141A',
  highlight: '#F5C05A',
  highlightSoft: '#2E2413',
  highlightInk: '#F5C05A',
};

describe('WCAG Contrast Ratios (Light Mode)', () => {
  const pairs = [
    { name: 'ink / canvas', fg: lightTokens.ink, bg: lightTokens.canvas, min: 4.5 },
    { name: 'ink / surface', fg: lightTokens.ink, bg: lightTokens.surface, min: 4.5 },
    { name: 'ink-secondary / canvas', fg: lightTokens.inkSecondary, bg: lightTokens.canvas, min: 4.5 },
    { name: 'ink-muted / canvas', fg: lightTokens.inkMuted, bg: lightTokens.canvas, min: 3.0 },
    { name: 'ink-muted / surface', fg: lightTokens.inkMuted, bg: lightTokens.surface, min: 3.0 },
    { name: 'primary-ink / primary', fg: lightTokens.primaryInk, bg: lightTokens.primary, min: 4.5 },
    { name: 'highlight-ink / highlight', fg: lightTokens.highlightInk, bg: lightTokens.highlight, min: 3.0 },
    { name: 'highlight-ink / highlight-soft', fg: lightTokens.highlightInk, bg: lightTokens.highlightSoft, min: 4.5 },
  ];

  for (const { name, fg, bg, min } of pairs) {
    it(`asserts ${name} contrast ratio >= ${min}:1`, () => {
      const ratio = getContrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(min);
    });
  }
});

describe('WCAG Contrast Ratios (Dark Mode)', () => {
  const pairs = [
    { name: 'ink / canvas', fg: darkTokens.ink, bg: darkTokens.canvas, min: 4.5 },
    { name: 'ink / surface', fg: darkTokens.ink, bg: darkTokens.surface, min: 4.5 },
    { name: 'ink-secondary / canvas', fg: darkTokens.inkSecondary, bg: darkTokens.canvas, min: 4.5 },
    { name: 'ink-muted / canvas', fg: darkTokens.inkMuted, bg: darkTokens.canvas, min: 3.0 },
    { name: 'ink-muted / surface', fg: darkTokens.inkMuted, bg: darkTokens.surface, min: 3.0 },
    { name: 'primary-ink / primary', fg: darkTokens.primaryInk, bg: darkTokens.primary, min: 4.5 },
    { name: 'primary-ink / highlight', fg: darkTokens.primaryInk, bg: darkTokens.highlight, min: 4.5 },
    { name: 'highlight-ink / highlight-soft', fg: darkTokens.highlightInk, bg: darkTokens.highlightSoft, min: 4.5 },
  ];

  for (const { name, fg, bg, min } of pairs) {
    it(`asserts ${name} contrast ratio >= ${min}:1`, () => {
      const ratio = getContrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(min);
    });
  }
});
