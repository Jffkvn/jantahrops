# Engineering Conventions — JantaHR Ops

This document serves as a strict checklist for all development sessions.

## Mandatory Rules & Guidelines

- **Money**: Money is `bigint` whole UGX. Never `float`, never cents, never `number`.
- **Dates**: Dates are stored UTC and displayed in `Africa/Kampala` (EAT) using `lib/format.ts`.
- **Phones**: Ugandan phone numbers are normalized to E.164 (`+256XXXXXXXXX`) via `lib/phone.ts` before database insertion.
- **Lists & Queries**: Every list is paginated and searched **server-side**. Never fetch a full table into the browser to filter in JS.
- **Indexing**: Every foreign key is indexed. Every column used in a `WHERE` or `ORDER BY` clause gets an index.
- **Design Tokens**: Colors come from CSS tokens only. No hardcoded hex values outside `src/styles/`.
- **Security & Credentials**: The service-role key never appears in client code. Anything requiring it is a Supabase Edge Function.
- **Module Boundaries**: Nothing in `src/lib/` may import from `src/features/`.
- **TypeScript**: `any` and `@ts-ignore` are banned. Use Zod and strict typing with unknown where appropriate.
- **Out of Scope (Do NOT Build)**:
  - Multi-tenancy / `tenant_id`
  - Permissions framework or roles matrix UI
  - Custom-field builder
  - Configurable pipelines
  - Payment gateway
  - LMS framework
