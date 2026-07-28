import type { JSX } from 'react';
import { cn } from '@/lib/cn';

interface LogoProps {
  /** Rendered size in px. The mark is square. */
  size?: number;
  className?: string;
  /** Accessible label. Pass null for decorative use alongside visible text. */
  title?: string | null;
}

/**
 * The JantaHR mark: an open-sided square.
 *
 * Geometry is measured from the original brand PNG — a perfect square with
 * sharp corners, a stroke of 3.23% of its width, and the right edge open
 * between 28.8% and 71.2% of the height. That open side is the defining
 * feature of the mark; do not close it.
 *
 * This is deliberately INLINE rather than <img src="/brand/logo-mark.svg">.
 * An SVG loaded through an <img> tag is an isolated document with no access to
 * the page's CSS, so `currentColor` would resolve to black and the mark could
 * not be recoloured — it would be invisible on the deep petrol sidebar.
 * Rendered inline, it inherits colour: <Logo className="text-primary" />.
 *
 * public/brand/logo-mark.svg still exists for the favicon and any non-React
 * context.
 */
export function Logo({ size = 32, className, title = 'JantaHR' }: LogoProps): JSX.Element {
  return (
    <svg
      aria-hidden={title === null ? true : undefined}
      className={cn('shrink-0', className)}
      fill="none"
      height={size}
      role={title === null ? undefined : 'img'}
      viewBox="0 0 100 100"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title !== null && <title>{title}</title>}
      <path
        d="M 98.385 28.84 L 98.385 1.615 L 1.615 1.615 L 1.615 98.385 L 98.385 98.385 L 98.385 71.16"
        fill="none"
        stroke="currentColor"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeWidth="3.23"
      />
    </svg>
  );
}
