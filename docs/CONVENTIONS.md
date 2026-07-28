# Engineering Conventions — JantaHR Ops

This document serves as a strict checklist for all development sessions.

## Mandatory Rules & Guidelines

- **Money**: Money is `bigint` whole UGX. Never `float`, never cents, never `number`.
- **Dates**: Dates are stored UTC and displayed in `Africa/Kampala` (EAT) using `lib/format.ts`.
- **Phones**: Ugandan phone numbers are normalized to E.164 (`+256XXXXXXXXX`) via `lib/phone.ts` before database insertion.
- **Lists & Queries**: Every list is paginated and searched **server-side**. Never fetch a full table into the browser to filter in JS.
- **Indexing**: Every foreign key is indexed. Every column used in a `WHERE` or `ORDER BY` clause gets an index.
- **Design Tokens**: Colors come from CSS tokens only. No hardcoded hex values outside `src/styles/`.
- **Security & Credentials**: Database access goes through `getSupabase()` from `lib/supabase.ts`. Never call `createClient` anywhere else. The service-role key never appears in client code. Anything requiring it is a Supabase Edge Function.
- **Module Boundaries**: Nothing in `src/lib/` may import from `src/features/`.
- **TypeScript**: `any` and `@ts-ignore` are banned. Use Zod and strict typing with unknown where appropriate.
- **Out of Scope (Do NOT Build)**:
  - Multi-tenancy / `tenant_id`
  - Permissions framework or roles matrix UI
  - Custom-field builder
  - Configurable pipelines
  - Payment gateway
  - LMS framework

## Brand Assets

- TODO: public/brand full-lockup logos are PNG pending vector source from Dora. The mark (logo-mark.svg) is true vector.
- The mark is rendered by `<Logo />` (src/components/logo.tsx), inline SVG so `currentColor` inherits. Never render it via `<img src="...svg">` — an SVG in an `<img>` cannot be recoloured and will be invisible on the dark sidebar.

## Database

- Access goes through `getSupabase()` in `src/lib/supabase.ts`. Never call `createClient` anywhere else — a second client means a second session store.
- Every schema change is a new timestamped migration in `supabase/migrations/`. Never edit an applied migration and never change the database by hand.
- Apply migrations with `npm run db:push` (uses the pooler; the direct `db.<ref>.supabase.co` host is IPv6-only and will not connect from an IPv4-only machine).
- RLS is enabled on every table. A policy that reads the same table it protects must go through a `security definer` helper (see `public.is_admin()`), or it recurses infinitely.
- Rules a policy cannot express — such as protecting a single column — go in a `BEFORE UPDATE` trigger (see `public.enforce_role_change()`).
- **The service-role key bypasses RLS policies but NOT triggers.** Any trigger that gates on `auth.uid()` must allow `auth.uid() IS NULL`, or trusted server-side callers and migrations are locked out — this made the first admin impossible to create until it was fixed.

## Auth

- No public sign-up. Accounts are created by an admin in the Supabase dashboard.
- Auth errors are mapped to our own copy in `auth-provider.tsx`. Never distinguish "no such user" from "wrong password", and `requestPasswordReset` always reports success — either would turn the form into an account-enumeration oracle.
- `ProtectedRoute` renders a skeleton while `loading` is true. Never render the login screen before auth settles; on reload that flashes the login page at a signed-in user.

## Secrets

- `.env.local` holds the anon key only. The anon key is public by design and safe in the browser bundle.
- The service-role key lives only in `.env.rls.local` (gitignored) and is used only by `npm run test:rls`. It must never appear in a `VITE_` variable, in the repo, or in CI without deliberate thought.
- `src/lib/bundle-safety.test.ts` fails the build if any non-anon JWT reaches `dist/`. Do not weaken it — note that grepping for the literal string `service_role` false-positives on Supabase's own JSDoc inside sourcemaps, which is why the real check decodes the JWT role claim.

## Testing

- RLS tests (`npm run test:rls`) run against a real database and **throw** rather than skip when credentials are absent. A skipped security test reads exactly like a passing one.
- Never weaken an assertion to make it pass. Report the number and stop.
