import {
  LayoutDashboard,
  Users,
  Building2,
  Target,
  Briefcase,
  UsersRound,
  GraduationCap,
  Receipt,
  Wallet,
  Megaphone,
  CheckSquare,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavGroup {
  /** Quiet uppercase section label, or null for the top ungrouped block. */
  heading: string | null;
  items: NavItem[];
}

/**
 * The single source of truth for the sidebar and the command bar. Adding a
 * section here adds it to both. Routes may render placeholders until their
 * phase builds them — see router.tsx.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    heading: null,
    items: [{ label: 'Today', path: '/', icon: LayoutDashboard }],
  },
  {
    heading: 'Pipeline',
    items: [
      { label: 'Leads', path: '/leads', icon: Target },
      { label: 'Contacts', path: '/contacts', icon: Users },
      { label: 'Organisations', path: '/organisations', icon: Building2 },
    ],
  },
  {
    heading: 'Delivery',
    items: [
      { label: 'Projects', path: '/projects', icon: Briefcase },
      { label: 'Recruitment', path: '/recruitment', icon: UsersRound },
      { label: 'Talent Pool', path: '/talent', icon: UsersRound },
      { label: 'Academy', path: '/academy', icon: GraduationCap },
    ],
  },
  {
    heading: 'Money',
    items: [
      { label: 'Finance', path: '/finance', icon: Receipt },
      { label: 'Expenses', path: '/expenses', icon: Wallet },
    ],
  },
  {
    heading: 'Workspace',
    items: [
      { label: 'Content', path: '/content', icon: Megaphone },
      { label: 'Tasks', path: '/tasks', icon: CheckSquare },
      { label: 'Reports', path: '/reports', icon: BarChart3 },
      { label: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];

/** Flattened, for the command bar and route generation. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
