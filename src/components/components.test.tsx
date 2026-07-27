import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/status-chip';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';

describe('Component Smoke Tests', () => {
  const variants = ['primary', 'secondary', 'ghost', 'highlight', 'danger', 'link'] as const;

  for (const variant of variants) {
    it(`renders Button variant=${variant} and handles onClick`, async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <Button variant={variant} onClick={handleClick}>
          Test Button
        </Button>,
      );

      const btn = screen.getByRole('button', { name: 'Test Button' });
      expect(btn).toBeInTheDocument();

      await user.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  }

  it('renders StatusChip in all 5 variants', () => {
    const chipVariants = ['success', 'warning', 'danger', 'info', 'neutral'] as const;
    for (const v of chipVariants) {
      const { container } = render(<StatusChip variant={v}>{v}</StatusChip>);
      expect(container.textContent).toContain(v);
    }
  });

  it('renders PageHeader and EmptyState correctly', () => {
    render(<PageHeader title="Leads Workspace" description="Manage sales pipeline" />);
    expect(screen.getByText('Leads Workspace')).toBeInTheDocument();
    expect(screen.getByText('Manage sales pipeline')).toBeInTheDocument();

    render(
      <EmptyState
        headline="No contacts yet"
        description="Add a contact to populate the workspace"
      />,
    );
    expect(screen.getByText('No contacts yet')).toBeInTheDocument();
  });
});
