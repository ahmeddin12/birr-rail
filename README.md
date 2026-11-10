# Birr Rail

_Pronounced BEER-rail._

Birr Rail is a payment orchestration layer: one API in front of Ethiopian payment providers. A merchant integrates once. Birr Rail creates payments, tracks their state, processes provider webhooks safely, notifies the merchant reliably, and reconciles its records against the provider's.

> **Sandbox only.** Birr Rail is a portfolio project. It never holds or moves real money, never handles card data, and refuses live provider keys. It makes no claim of licensing or regulatory compliance. Live use would need a registered business, approval from each payment provider, and review under the National Bank of Ethiopia's payment directives.

## Status

**Phase 0: project setup.** Payments, webhooks, the outbox, the ledger and reconciliation are planned and not built yet. See [Roadmap](#roadmap).

## What it is meant to demonstrate

Correctness under failure, each case proven by an automated test against a real Postgres database:

- duplicate API requests (idempotency keys)
- duplicate and out-of-order provider webhooks
- crashes in the middle of an operation
- lost messages (transactional outbox, at-least-once delivery)

## Quick start

Requirements: Node 24, pnpm 11, Docker.

```sh
pnpm install
pnpm infra:up                            # Postgres 16 on 127.0.0.1:5440, Redis 7 on 127.0.0.1:6390
cp apps/api/.env.example apps/api/.env
pnpm test                                # unit tests
pnpm test:e2e                            # e2e tests against the real payments_test database
pnpm dev                                 # API on http://localhost:3000
```

Check it is running: `GET /health` (liveness) and `GET /ready` (database reachable).

The `payments_test` database is created by an init script that only runs on an empty volume. If Postgres was started before that script existed, reset local data with `docker compose -f infra/docker-compose.yml down -v`. This deletes all local data.

## Commands

| Command           | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `pnpm dev`        | Run the API in watch mode                                |
| `pnpm build`      | Build all packages                                       |
| `pnpm lint`       | ESLint with type-aware rules                             |
| `pnpm typecheck`  | TypeScript in strict mode, no emit                       |
| `pnpm test`       | Unit tests (Vitest)                                      |
| `pnpm test:e2e`   | End-to-end tests (Vitest + Supertest, real Postgres)     |
| `pnpm format`     | Format with Prettier (`format:check` in CI)              |
| `pnpm infra:up`   | Start Postgres and Redis and wait until they are healthy |
| `pnpm infra:down` | Stop them (data is kept in Docker volumes)               |

## Repository layout

```
apps/api            NestJS API and worker (Prisma, Postgres)
apps/dashboard      Birr Rail Console (Next.js), planned
apps/demo-shop      Example merchant integration, planned
packages/shared     Shared types, zod schemas, money helpers, planned
packages/provider-kit  PaymentProvider interface, Birr Rail Sandbox and Chapa adapters, planned
packages/sdk        @birr-rail/sdk, planned
infra/              Docker Compose for local dependencies
docs/               Decisions, architecture and runbook
```

## Roadmap

0. Setup: monorepo, CI, real-database test harness (in progress)
1. Foundation: merchants, API keys, payment state machine, error format
2. Create payment, idempotency, Birr Rail Sandbox provider
3. Inbound webhooks and Chapa adapter (test mode)
4. Transactional outbox and outbound merchant webhooks
5. Ledger, refunds, expiry, reconciliation
6. Birr Rail Console dashboard
7. SDK, OpenAPI docs, demo shop
8. Hardening, load tests and sandbox deployment

## Docs

- [docs/DECISIONS.md](docs/DECISIONS.md): design decisions with options and trade-offs
