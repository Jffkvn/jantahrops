import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NAV_GROUPS, NAV_ITEMS } from './nav-config';
import { SidebarNav } from './sidebar-nav';

describe('nav config', () => {
  it('every nav item has a unique path and a label', () => {
    const paths = NAV_ITEMS.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(NAV_ITEMS.every((i) => i.label.length > 0)).toBe(true);
  });

  it('includes Today at the root and the four pipeline-and-money essentials', () => {
    const paths = NAV_ITEMS.map((i) => i.path);
    for (const p of ['/', '/leads', '/contacts', '/finance']) {
      expect(paths).toContain(p);
    }
  });
});

describe('SidebarNav', () => {
  it('renders every nav label and the section headings when expanded', () => {
    render(
      <MemoryRouter>
        <SidebarNav collapsed={false} />
      </MemoryRouter>,
    );
    for (const item of NAV_ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
    for (const group of NAV_GROUPS) {
      if (group.heading) expect(screen.getByText(group.heading)).toBeInTheDocument();
    }
  });

  it('hides labels and headings when collapsed but keeps the links', () => {
    render(
      <MemoryRouter>
        <SidebarNav collapsed />
      </MemoryRouter>,
    );
    // Labels are visually gone…
    expect(screen.queryByText('Leads')).toBeNull();
    // …but the links remain, titled for accessibility.
    const nav = screen.getByRole('navigation');
    expect(within(nav).getAllByRole('link').length).toBe(NAV_ITEMS.length);
  });

  it('marks the active route with aria-current', () => {
    render(
      <MemoryRouter initialEntries={['/leads']}>
        <SidebarNav collapsed={false} />
      </MemoryRouter>,
    );
    const active = screen.getByText('Leads').closest('a');
    expect(active?.getAttribute('aria-current')).toBe('page');
  });
});
