import { createBrowserRouter } from 'react-router';
import StyleguidePage from './styleguide';
import { AppShell } from './shell/app-shell';
import { PlaceholderPage } from './shell/placeholder-page';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { LoginPage } from '@/features/auth/login-page';
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page';
import { ResetPasswordPage } from '@/features/auth/reset-password-page';
import { TodayPage } from '@/features/today/today-page';
import { LeadsPage } from '@/features/leads/leads-page';

/** Placeholder routes, tagged with the phase that will build each for real. */
const placeholders: { path: string; title: string; phase: string }[] = [
  { path: 'contacts', title: 'Contacts', phase: 'Phase 0' },
  { path: 'organisations', title: 'Organisations', phase: 'Phase 0' },
  { path: 'projects', title: 'Projects', phase: 'Phase 4' },
  { path: 'recruitment', title: 'Recruitment', phase: 'Phase 3' },
  { path: 'talent', title: 'Talent Pool', phase: 'Phase 3' },
  { path: 'academy', title: 'Academy', phase: 'Phase 5' },
  { path: 'finance', title: 'Finance', phase: 'Phase 2' },
  { path: 'expenses', title: 'Expenses', phase: 'Phase 2' },
  { path: 'content', title: 'Content', phase: 'Phase 6' },
  { path: 'tasks', title: 'Tasks', phase: 'Phase 1' },
  { path: 'reports', title: 'Reports', phase: 'Phase 6' },
  { path: 'settings', title: 'Settings', phase: 'Phase 5' },
];

export const router = createBrowserRouter([
  // Public — the only routes that do not require a session.
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },

  // Design review surface. Public so it can be opened without an account.
  { path: '/styleguide', element: <StyleguidePage /> },

  // Everything else lives inside the authenticated app shell.
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'leads', element: <LeadsPage /> },
      ...placeholders.map((p) => ({
        path: p.path,
        element: <PlaceholderPage phase={p.phase} title={p.title} />,
      })),
      {
        path: '*',
        element: <PlaceholderPage phase="a future phase" title="Not found" />,
      },
    ],
  },
]);
