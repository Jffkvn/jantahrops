# JantaHR Ops

JantaHR Ops is an internal operating system for JantaHR, an HR consultancy in Uganda. It streamlines business ops, CRM leads, finance, recruitment, projects, and academy management in a fast, centralized workspace.

> **Specification**: See [JANTAHR_OPS_BUILD_PLAN.md](JANTAHR_OPS_BUILD_PLAN.md) — it is the source of truth.

## Prerequisites

- **Node.js**: v22 LTS (specified in `.nvmrc`)
- **Package Manager**: npm

## Quick Setup

1. Clone the repository and navigate into the folder:
   ```bash
   nvm use
   npm install
   ```
2. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
4. Start the local development server:
   ```bash
   npm run dev
   ```

## NPM Scripts

| Script          | Command                                             | Description                                        |
| --------------- | --------------------------------------------------- | -------------------------------------------------- |
| `dev`           | `vite`                                              | Starts local dev server on http://localhost:5180   |
| `build`         | `tsc -b && vite build`                              | Typechecks and builds production bundle to `dist/` |
| `preview`       | `vite preview`                                      | Previews production build locally                  |
| `lint`          | `eslint .`                                          | Runs ESLint 9 checks across all files              |
| `lint:fix`      | `eslint . --fix`                                    | Automatically fixes mechanical lint issues         |
| `format`        | `prettier --write .`                                | Formats codebase using Prettier                    |
| `format:check`  | `prettier --check .`                                | Verifies code formatting                           |
| `typecheck`     | `tsc -b --noEmit`                                   | Runs strict TypeScript type check                  |
| `test`          | `vitest run`                                        | Runs Vitest unit and integration test suite        |
| `test:watch`    | `vitest`                                            | Runs Vitest in watch mode                          |
| `test:coverage` | `vitest run --coverage`                             | Generates v8 test coverage report                  |
| `check`         | `npm run typecheck && npm run lint && npm run test` | Complete CI check pipeline                         |

## Project Structure

```
.
├── .nvmrc                   # Node version specifier (22)
├── .env.example             # Template for required environment variables
├── docs/                    # Project documentation & conventions
│   └── CONVENTIONS.md       # Architecture & engineering rules
├── public/                  # Static assets (fonts, brand images)
├── src/
│   ├── app/                 # App initialization, router & providers
│   ├── components/ui/       # Shared UI primitives (shadcn in 0.2)
│   ├── features/            # Domain feature modules (CRM, Finance, etc.)
│   ├── hooks/               # Global custom hooks
│   ├── lib/                 # Foundation utilities (env, supabase, format, phone, cn)
│   ├── styles/              # Global CSS & Tailwind setup
│   ├── test/                # Test setup & configuration
│   └── types/               # TypeScript type definitions
├── JANTAHR_OPS_BUILD_PLAN.md# Complete build specification
├── ANTIGRAVITY_PROMPTS.md   # Antigravity execution prompt sequence
└── TESTING.md               # Testing tiers and requirements
```

## Conventions

For detailed engineering rules (whole UGX money handling, E.164 phone numbers, UTC/EAT dates, security, and out-of-scope features), refer to [docs/CONVENTIONS.md](docs/CONVENTIONS.md).
