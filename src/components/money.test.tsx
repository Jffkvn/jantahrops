import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Money } from './money';

describe('Money Component', () => {
  it('renders 4500000n as UGX 4,500,000 with tabular-nums class', () => {
    render(<Money value={4500000n} />);

    const el = screen.getByText('UGX 4,500,000');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('num');
  });

  it('renders compact money when compact prop is true', () => {
    render(<Money value={4500000n} compact />);
    expect(screen.getByText('UGX 4.5M')).toBeInTheDocument();
  });
});
