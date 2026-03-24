# LexFlow Trust Accounting Service

> IOLTA-compliant trust accounting engine built with Fastify 4 + TypeScript + Drizzle ORM + PostgreSQL 15.

## Overview

The Trust Service is an isolated Fastify microservice that handles financial transactions for law firm trust accounts. It enforces double-entry bookkeeping, advisory locking, SERIALIZABLE isolation, and full audit trails.

**REF:** [CON-002](codex/CODEX/20_BLUEPRINTS/CON-002_TrustServiceHTTPAPI.md) — Binding API contract  
**REF:** [AGT-003-BE](codex/CODEX/80_AGENTS/AGT-003-BE_Backend_Developer.md) — Agent role definition

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| Framework | Fastify 4 |
| Language | TypeScript (strict mode) |
| Schema Validation | TypeBox |
| ORM | Drizzle ORM |
| Database | PostgreSQL 15 |
| Testing | Vitest |
| Logging | pino (structured JSON) |

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# Start development server (port 4000)
npm run dev

# Verify health
curl http://localhost:4000/health
```

## Scripts

| Script | Description |
|:-------|:------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checker |
| `npm test` | Run Vitest test suite |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run Drizzle migrations |

## Environment Variables

See [.env.example](.env.example) for all required variables.

| Variable | Required | Default | Description |
|:---------|:---------|:--------|:------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `INTERNAL_SERVICE_KEY` | Yes | — | Shared secret for inter-service auth |
| `PORT` | No | `4000` | Service port |
| `NODE_ENV` | No | `development` | Environment mode |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `SERVICE_NAME` | No | `lexflow-trust` | Service name in logs |

## Project Structure

```
src/
├── index.ts              # Entry point + global error handlers
├── server.ts             # Fastify app factory
├── db/
│   └── connection.ts     # PostgreSQL pool + Drizzle setup
├── lib/
│   └── errors.ts         # ApplicationError + error taxonomy
├── plugins/
│   ├── correlation-id.ts # X-Correlation-ID propagation
│   └── error-handler.ts  # Structured error responses
└── routes/
    └── health.ts         # GET /health endpoint
```

## Governance Compliance

This service complies with the LexFlow CODEX governance standards:

- **GOV-003**: TypeScript strict mode, ESLint, no `any` types
- **GOV-004**: Structured error handling, correlation IDs, global exception handlers
- **GOV-006**: pino structured JSON logging
