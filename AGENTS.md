# Repository Guidelines

## Project Structure & Module Organization

This repository is a Bun workspace. `apps/web` contains the SvelteKit UI, routes, auth, and server endpoints; `apps/worker` runs queued and scheduled jobs; `packages/core` holds shared database, domain, validation, encryption, and agent code. Database schema and operational scripts are in `scripts/`, local PostgreSQL/Redis services are in `infra/`, and product/architecture notes are in `docs/`. Tests live in `tests/`; design references are in `Menu Picture/`.

## Build, Test, and Development Commands

- `bun install --frozen-lockfile` installs the pinned workspace dependencies.
- `bun run dev` starts the web app locally; `bun run worker` starts the background worker.
- `bun run check` runs Svelte/TypeScript checks for the web app and worker.
- `bun run test` runs unit tests; `bun run test:integration` runs database/Redis integration tests.
- `bun run build` builds the web app. For browser tests, install Chromium with `bunx playwright install chromium`, then run `E2E_BASE_URL=http://localhost:5173 bunx playwright test` against a running app.
- Start local services with `docker compose --env-file .env -f infra/compose.yaml up -d`; apply schema changes using `bun run db:migrate`.

## Coding Style & Naming Conventions

Use TypeScript and Svelte with ES modules, two-space indentation, and the existing workspace alias/import patterns. Keep shared business logic in `packages/core` rather than duplicating it in routes or the worker. Use descriptive camelCase for functions and variables, PascalCase for types/components, and follow SvelteKit route filenames such as `+page.server.ts`. Preserve the app's Indonesian and English localization conventions. Prettier with `prettier-plugin-svelte` is available; match nearby formatting when editing.

## Testing Guidelines

Add unit coverage in `tests/unit.test.ts` for isolated logic and integration coverage in `tests/integration.test.ts` for database, Redis, or service behavior. Playwright specs exercise browser flows. Run the narrow relevant check first, then `bun run check` and applicable test commands. Integration tests need migrated PostgreSQL and Redis; browser tests create fixture accounts, so use a test environment.

## Commit & Pull Request Guidelines

Recent commits use concise Conventional Commit prefixes, for example `feat(worker): ...` and `docs(tasklist): ...`. Keep subjects imperative and scoped when practical. Pull requests should explain the behavior or fix, link relevant task/issues, list validation commands and outcomes, and include screenshots for visible UI changes. Call out schema/configuration changes and update relevant documentation.

## Security & Configuration

Copy `.env.example` to `.env` for local development; never commit secrets, runtime logs, or test artifacts. Use strong local auth/encryption keys and keep database credentials consistent between `DATABASE_URL` and Compose settings.
