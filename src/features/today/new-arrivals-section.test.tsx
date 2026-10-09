import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NewArrivalsSection } from './new-arrivals-section';
import { leadLabel, type Arrival } from './new-arrivals-api';

const { hooks } = vi.hoisted(() => ({
  hooks: { useNewArrivals: vi.fn(), useMarkReviewed: vi.fn() },
}));
vi.mock('./use-new-arrivals', () => hooks);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const arrivals: Arrival[] = [
  {
    kind: 'lead',
    id: 'l1',
    name: 'Kev Odhis',
    detail: 'Enquiry · HR consulting',
    createdAt: new Date().toISOString(),
  },
  {
    kind: 'application',
    id: 'a1',
    name: 'Jane Namuli',
    detail: 'Application · Payroll Officer',
    createdAt: new Date().toISOString(),
    vacancyId: 'v1',
    candidateId: 'c1',
  },
];

function renderSection(onOpenLead = vi.fn()) {
  render(
    <MemoryRouter>
      <NewArrivalsSection onOpenLead={onOpenLead} />
    </MemoryRouter>,
  );
  return onOpenLead;
}

describe('NewArrivalsSection', () => {
  const mutateAsync = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.useMarkReviewed.mockReturnValue({ mutateAsync, isPending: false });
  });

  it('renders nothing when the queue is empty', () => {
    hooks.useNewArrivals.mockReturnValue({ data: [] });
    const { container } = render(
      <MemoryRouter>
        <NewArrivalsSection onOpenLead={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists arrivals, opens a lead, and marks one or all reviewed', () => {
    hooks.useNewArrivals.mockReturnValue({ data: arrivals });
    const onOpenLead = renderSection();

    expect(screen.getByText('New from the website')).toBeInTheDocument();
    expect(screen.getByText('Application · Payroll Officer', { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Kev Odhis'));
    expect(onOpenLead).toHaveBeenCalledWith('l1');

    fireEvent.click(screen.getByLabelText('Mark Jane Namuli as reviewed'));
    expect(mutateAsync).toHaveBeenCalledWith([arrivals[1]]);

    fireEvent.click(screen.getByRole('button', { name: /Mark all reviewed/ }));
    expect(mutateAsync).toHaveBeenCalledWith(arrivals);
  });
});

describe('leadLabel', () => {
  it('names website lead types', () => {
    expect(leadLabel('Website (ai_training) /ai-training')).toBe('AI training registration');
    expect(leadLabel('Website (contact) /contact')).toBe('Enquiry');
    expect(leadLabel(null)).toBe('Lead');
  });
});
