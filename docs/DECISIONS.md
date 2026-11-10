# Decisions

One entry per significant decision: context, options considered, decision, trade-offs. Newest last. Entries are not edited after the fact; a changed decision gets a new entry that supersedes the old one.

## D-001 Monorepo with Turborepo and pnpm workspaces

- **Context:** the API, dashboard, demo shop, SDK and shared packages must share types and run in one CI pipeline.
- **Options:** pnpm workspaces, Bun workspaces, npm workspaces; each with Turborepo.
- **Decision:** pnpm 11 with Turborepo. Versions shared by several packages live in the pnpm catalog (`pnpm-workspace.yaml`).
- **Trade-offs:** pnpm's strict `node_modules` catches undeclared dependencies. Bun installs faster, but NestJS, Prisma and Turborepo are most widely used with pnpm.

## D-002 NestJS 12 (ESM) with Vitest instead of Jest

- **Context:** NestJS 12 ships ESM-only packages and its official starter uses Vitest. Jest loads ESM only with the experimental `--experimental-vm-modules` flag. NestJS 11 is tagged `legacy` on npm.
- **Options:** NestJS 11 with Jest; NestJS 12 with Jest in ESM mode; NestJS 12 with Vitest.
- **Decision:** NestJS 12 with Vitest. Supertest and the rule "real Postgres, never a mocked database for core logic" are unchanged.
- **Trade-offs:** departs from the original plan (Jest). Vitest's API matches Jest's, so tests read the same. Decorator metadata comes from Vite's transform instead of `tsc`; the e2e suite would fail if dependency injection by type stopped working.

## D-003 TypeScript pinned to 6.0.x

- **Context:** TypeScript 7 is the current release, but typescript-eslint supports only `<6.1.0` and other tooling still depends on the TypeScript 6 JavaScript API.
- **Options:** TypeScript 7 without type-aware linting; TypeScript 6.0.x.
- **Decision:** `~6.0.3` through the pnpm catalog. Revisit when typescript-eslint supports TypeScript 7.
- **Trade-offs:** misses TypeScript 7's faster compiler; keeps type-aware lint rules such as `no-floating-promises`, which matter in async payment code.

## D-004 Prisma 7 pinned exactly, with the pg driver adapter

- **Context:** npm's `latest` tag for `prisma` points to an 8.0 release candidate while `@prisma/client` is on 7.10.1. Prisma 7 requires a driver adapter and `prisma.config.ts`.
- **Options:** follow `latest`; pin the 7.x line.
- **Decision:** `prisma`, `@prisma/client` and `@prisma/adapter-pg` pinned to the same exact 7.x version. The generated client is not committed; Turborepo generates it before typecheck, lint, test and build.
- **Trade-offs:** upgrades are manual. Raw SQL for `FOR UPDATE` and `SKIP LOCKED` stays available through `$queryRaw`.

## D-005 Separate test database with a name guard

- **Context:** e2e tests run against real Postgres, and later phases truncate tables between tests.
- **Options:** share the dev database; one test database; one database per test worker.
- **Decision:** a separate `payments_test` database. The e2e runner refuses any database whose name does not end in `_test`. e2e files run one at a time.
- **Trade-offs:** serial e2e runs are slower; per-worker databases can come later if the suite gets slow.

## D-006 Separate liveness and readiness endpoints

- **Context:** an orchestrator restarts a process whose health check fails.
- **Options:** one `/health` that checks the database; separate liveness and readiness checks.
- **Decision:** `GET /health` checks nothing but the process. `GET /ready` checks Postgres (Redis is added when BullMQ arrives).
- **Trade-offs:** two endpoints to wire into monitoring, but a database outage takes the API out of rotation instead of causing a restart loop.
