# Repository Guidelines

## Project Structure & Module Organization

- Monorepo lives in `turborepo/` (pnpm + Turborepo).
- Apps: `apps/web` (Next.js 15, `src/app`), `apps/ws-server` (TypeScript WS/API).
- Packages: `packages/db` (Prisma schema and clients at `prisma/`), `packages/ui`, `packages/storage-s3`, `packages/encryption`, `packages/credentials-service`, `packages/key-validator`, `packages/types`.
- `packages/db`: IMPORTANT--do not modify or rename the generators. Two extremely different targets -- serverless next.js `apps/web` using edge-compat+accelerate vs persistent WS Server (`apps/ws-server`) on ECS Fargate using Driver Adapters+node only)
- Tooling: `tooling/*` (eslint, prettier, jest presets, tsconfig). Local infra: `turborepo/docker-compose.yml` (Postgres, Redis, ws-server).

## Build, Test, and Development Commands

- Setup: `cd turborepo && pnpm install` (Node >= 22).
- Dev (all): `pnpm dev`. Individual: `pnpm run:web`, `pnpm run:ws-server`.
- Build: `pnpm build:web`, `pnpm build:ws-server`, or `pnpm build:targeted`.
- Lint/Typecheck/Format: `pnpm lint`, `pnpm typecheck`, `pnpm format`.
- Database (from repo root): `pnpm --filter @slipstream/db db:migrate`; open Studio: `pnpm --filter @slipstream/db prisma:studio`.
- Tests: Node packages use Jest via `@slipstream/jest-presets/node`. Place tests in `__tests__/` or `*.test.ts`. Example (run from a package dir): `npx jest -c node_modules/@slipstream/jest-presets/node/jest-preset.mjs`. Web e2e: Playwright available in `apps/web`.

## Coding Style & Naming Conventions

- TypeScript strict; ESM (`"type": "module"`); 2‑space indentation.
- Prettier: `@slipstream/prettier-config`; ESLint: `@slipstream/eslint-config`.
- React components in PascalCase; co‑locate as `folder/index.tsx` (e.g., `src/ui/atoms/tooltip/index.tsx`). Use `@/*` paths in web (`tsconfig` paths).
- TypeScript: always prefer using `satisfies Type` over `: Type` or `as Type` assertions

## Testing Guidelines

- Add unit tests for non‑trivial logic; mock I/O and external services.
- Prefer colocated tests (`src/**/*.test.ts`) or `__tests__/` folders. Keep tests fast and deterministic.

## Commit & Pull Request Guidelines

- Use concise, imperative subjects (e.g., `ws-server: add message pagination`).
- Link issues (`Closes #123`), include screenshots for UI changes.
- PRs must pass `pnpm typecheck`, `pnpm lint`, and build affected apps/packages.

## Security & Configuration Tips

- Do not commit secrets. Copy `.env.example` into `apps/web/.env` and `apps/ws-server/.env`.
- For local services use `pnpm run:web` and `pnpm run:ws-server` in a split terminal from the root of the `turborepo` directory
- For the `python` app, cd into the `python` directory and run `pdm run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`

## Agent-Specific Instructions

- Keep diffs minimal and scoped to the relevant package/app. Update docs/tests alongside code changes. Avoid reformatting unrelated files or adding license headers.
