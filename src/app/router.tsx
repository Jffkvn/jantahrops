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
import { FinancePage } from '@/features/finance/finance-page';
import { DocumentEditor } from '@/features/finance/document-editor';
import { ExpensesPage } from '@/features/finance/expenses-page';
import { PrintView } from '@/features/finance/print-view';
import { RecruitmentPage } from '@/features/recruitment/recruitment-page';
import { VacancyPipelinePage } from '@/features/recruitment/vacancy-pipeline-page';
import { TalentPoolPage } from '@/features/recruitment/talent-pool-page';
import { ShortlistPrintView } from '@/features/recruitment/shortlist-print-view';
import { ContactsPage } from '@/features/directory/contacts-page';
import { OrganisationsPage } from '@/features/directory/organisations-page';

/** Placeholder routes, tagged with the phase that will build each for real. */
const placeholders: { path: string; title: string; phase: string }[] = [
  { path: 'projects', title: 'Projects', phase: 'Phase 4' },
  { path: 'academy', title: 'Academy', phase: 'Phase 5' },
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

  // Document print/PDF view — rendered WITHOUT the app shell.
  {
    path: '/finance/:id/print',
    element: (
      <ProtectedRoute>
        <PrintView />
      </ProtectedRoute>
    ),
  },

  // Recruitment shortlist pack — rendered WITHOUT the app shell, like the finance print view.
  {
    path: '/recruitment/:vacancyId/shortlist',
    element: (
      <ProtectedRoute>
        <ShortlistPrintView />
      </ProtectedRoute>
    ),
  },

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
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'organisations', element: <OrganisationsPage /> },
      { path: 'finance', element: <FinancePage /> },
      { path: 'finance/new/:type', element: <DocumentEditor /> },
      { path: 'finance/:id', element: <DocumentEditor /> },
      { path: 'expenses', element: <ExpensesPage /> },
      { path: 'recruitment', element: <RecruitmentPage /> },
      { path: 'recruitment/:vacancyId', element: <VacancyPipelinePage /> },
      { path: 'talent', element: <TalentPoolPage /> },
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
