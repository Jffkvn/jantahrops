import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApplicationBoard } from './application-board';
import { stageMeta, BOARD_STAGES, PIPELINE_STAGES } from './recruitment-meta';
import type { ApplicationWithRelations } from './recruitment-api';

vi.mock('./use-recruitment', () => ({
  useApplications: vi.fn(),
  useMoveStage: vi.fn(),
  useVacancy: vi.fn(() => ({ data: undefined })),
  useUpdateVacancy: vi.fn(() => ({ mutate: vi.fn() })),
}));

import { useApplications, useMoveStage } from './use-recruitment';

const mockedUseApplications = vi.mocked(useApplications);
const mockedUseMoveStage = vi.mocked(useMoveStage);

function makeApp(
  id: string,
  stage: ApplicationWithRelations['stage'],
  name = `Candidate ${id}`,
): ApplicationWithRelations {
  return {
    id,
    vacancy_id: 'v1',
    candidate_id: id,
    source: null,
    stage,
    applied_at: '2026-08-01T09:00:00.000Z',
    owner_id: null,
    notes: null,
    rejected_reason: null,
    screening_answers: {},
    created_at: '2026-08-01T09:00:00.000Z',
    updated_at: '2026-08-01T09:00:00.000Z',
    vacancy: { id: 'v1', title: 'Senior React Engineer', slug: 'senior-react-engineer', status: 'open' },
    candidate: { id, headline: 'Senior dev', skills: ['react', 'ts'], rating: 4, years_experience: 6, salary_expectation_ugx: 5000000, availability: 'immediate' },
    candidateContact: { id, full_name: name, email: `${id}@x.ug`, phone_e164: null },
  };
}

describe('recruitment-meta', () => {
  it('every application stage has metadata and rejected/talent_pool are off-board', () => {
    for (const s of PIPELINE_STAGES) {
      expect(stageMeta(s.value).value).toBe(s.value);
      expect(stageMeta(s.value).label.length).toBeGreaterThan(0);
    }
    const boardValues = BOARD_STAGES.map((s) => s.value);
    expect(boardValues).toContain('new');
    expect(boardValues).toContain('hired');
    expect(boardValues).not.toContain('rejected');
    expect(boardValues).not.toContain('talent_pool');
  });
});

describe('ApplicationBoard', () => {
  it('groups applications by stage and shows the right columns', () => {
    const apps = [makeApp('a', 'new', 'Ann'), makeApp('b', 'shortlisted', 'Bob'), makeApp('c', 'hired', 'Cat')];
    mockedUseApplications.mockReturnValue({ data: apps, isLoading: false } as never);
    mockedUseMoveStage.mockReturnValue({ mutate: vi.fn() } as never);

    render(<ApplicationBoard vacancyId="v1" onOpenApplication={() => {}} />);

    // All board columns render.
    for (const stage of BOARD_STAGES) {
      expect(screen.getAllByText(stage.label).length).toBeGreaterThan(0);
    }
    // Rejected and talent pool are NOT columns.
    expect(screen.queryByText('Rejected')).toBeNull();
    expect(screen.queryByText('Talent pool')).toBeNull();

    // Each candidate renders on the board.
    expect(screen.getByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Cat')).toBeInTheDocument();
    // Column count badges render the grouped totals.
    const newCount = screen.getAllByText('New')[0]?.closest('div');
    expect(newCount?.textContent).toContain('1');
  });

  it('does not render the rejected and talent_pool candidates on the board', () => {
    const apps = [makeApp('r', 'rejected', 'Roy'), makeApp('t', 'talent_pool', 'Tai')];
    mockedUseApplications.mockReturnValue({ data: apps, isLoading: false } as never);
    mockedUseMoveStage.mockReturnValue({ mutate: vi.fn() } as never);

    render(<ApplicationBoard vacancyId="v1" onOpenApplication={() => {}} />);

    expect(screen.queryByText('Roy')).toBeNull();
    expect(screen.queryByText('Tai')).toBeNull();
  });

  it('calls moveStage when a card is dragged from one column to another', () => {
    const apps = [makeApp('a', 'new', 'Ann')];
    mockedUseApplications.mockReturnValue({ data: apps, isLoading: false } as never);
    const moveMutate = vi.fn();
    mockedUseMoveStage.mockReturnValue({ mutate: moveMutate } as never);

    render(<ApplicationBoard vacancyId="v1" onOpenApplication={() => {}} />);

    const card = screen.getByText('Ann').closest('[draggable="true"]') ?? screen.getByText('Ann');
    fireEvent.dragStart(card);

    const screenCol = screen.getAllByText('Screened')[0]?.closest('div');
    const dropTarget = screenCol ?? screen.getAllByText('Screened')[0]!;
    fireEvent.dragOver(dropTarget);
    fireEvent.drop(dropTarget);

    expect(moveMutate).toHaveBeenCalledWith({ id: 'a', stage: 'screened' });
  });

  it('does not call moveStage when dropped on its own column', () => {
    const apps = [makeApp('a', 'hired', 'Ann'), makeApp('fresh', 'new', 'Fresh')];
    mockedUseApplications.mockReturnValue({ data: apps, isLoading: false } as never);
    const moveMutate = vi.fn();
    mockedUseMoveStage.mockReturnValue({ mutate: moveMutate } as never);

    render(<ApplicationBoard vacancyId="v1" onOpenApplication={() => {}} />);

    const card = screen.getByText('Ann').closest('[draggable="true"]') ?? screen.getByText('Ann');
    fireEvent.dragStart(card);

    const hiredCol = screen.getAllByText('Hired')[0]?.closest('div');
    const dropTarget = hiredCol ?? screen.getAllByText('Hired')[0]!;
    fireEvent.dragOver(dropTarget);
    fireEvent.drop(dropTarget);

    expect(moveMutate).not.toHaveBeenCalled();
  });
});