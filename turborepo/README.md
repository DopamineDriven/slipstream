# Slipstream — Turborepo

Monorepo for a multi‑provider AI chat application with streaming over WebSockets, resumable streams via Redis, and asset uploads to S3. Built with Next.js (web), a Node `ws` server, and shared TypeScript packages.

## Overview

- Apps
  - `apps/web`: Next.js 15 + React 19 web client, NextAuth v5 auth, Prisma (Edge) + Accelerate, rich chat UI and asset attachment.
  - `apps/ws-server`: Node WebSocket server (ws) that authenticates users, routes AI chat to providers, handles asset presigned uploads, persists state via Prisma, and broadcasts via Redis.
- Packages 
  - `packages/types`: Source of truth for all typed WS events and model/provider mappings.
  - `packages/redis-service`: Robust Redis client + typed pub/sub + resumable stream state helpers.
  - `packages/storage-s3`: S3 utilities: presigned uploads, finalize (HEAD), direct/multipart uploads, copy/list/delete, signed downloads.
  - `packages/credentials-service`: Fetches secrets from AWS Secrets Manager (cached) + newline unflatten helpers.
  - `packages/encryption`: AES‑256‑GCM encryption/decryption of user API keys using `ENCRYPTION_KEY`.
  - `packages/key-validator`: Provider API key verification (OpenAI, Anthropic, Gemini, xAI/Grok, Meta workaround, Vercel v0).
  - `packages/ui`: Shared UI components and icons.

## Architecture

```
[ Next.js Web (apps/web) ]  ⇄  [ WS Server (apps/ws-server) ]
        │  Prisma Edge                  │  Prisma Client (generated)
        │                               │
        ├──> Redis (pub/sub, stream state: chunks + thinking) <───┤
        │                               │
        └──> S3 (presigned uploads; finalize/HEAD; public URLs) <──┘

                 │
                 └──> Provider Services (OpenAI, Anthropic, Gemini, xAI/Grok, Meta/Llama, Vercel v0)

Secrets/Config: AWS Secrets Manager → credentials-service → consumers
Key Storage: encrypted (AES‑GCM) via encryption package; decrypted on server for use
```

### Data Flow (Essentials)

- Auth/Session
  - Web uses NextAuth v5 (Prisma adapter). On sign‑in, a session record is created. `middleware.ts` sets geo/user-agent cookies (`country`, `city`, `latlng`, `tz`, etc.).
  - WS handshake includes `?email=...` and validates the latest session via Prisma, then persists profile geo info.

- Chat Streaming
  - Client sends `ai_chat_request` with `conversationId` (`new-chat` or existing), prompt, provider/model, and optional `batchId/draftId` if assets are attached.
  - Server persists message/settings, decrypts stored user provider key, calls the selected provider, streams chunks (`ai_chat_chunk`) with optional thinking text/duration, and a final `ai_chat_response`.
  - Resumable state (chunks + metadata + thinkingChunks) is stored in Redis with TTL; server also mirrors events to Redis channels for multi‑subscriber consumers.

- Assets
  - Client emits `asset_paste` or `asset_attached` with file metadata. Server creates an `attachment` record (status `REQUESTED`) and returns presigned PUT (`asset_upload_instructions`).
  - Client uploads directly to S3, then sends `asset_upload_complete`. Server `finalize()`s (HEAD/ETag/version/size), updates DB to `READY`, and broadcasts `asset_ready`.

### Protocol Types

All WS events are defined in `packages/types/src/events.ts` under `EventTypeMap` (chat streaming, asset lifecycle, typing, ping, image‑gen scaffolding). Both web and server import these for strict typing.

## Repos & Key Files

- Web (`apps/web`)
  - WS Client: `src/utils/chat-ws-client.ts` — parses & dispatches typed events, queueing, reconnects, auto‑pong.
  - Chat Orchestration: `src/context/ai-chat-context.tsx` — new‑chat → real ID URL swap on first chunk, thinking text, state.
  - Auth: `src/lib/auth.ts` + `src/lib/auth.config.ts`; cookies: `src/middleware.ts`.
  - Prisma (Edge): `src/lib/prisma.ts`; schema+migrations under `prisma/`.

- WS Server (`apps/ws-server`)
  - Entrypoint: `src/index.ts` — loads secrets, creates S3/Redis/Prisma/services, starts HTTP+WS (`/health`).
  - Server: `src/ws-server/index.ts` — handshake auth (email → session), cookie parse to profile, broadcast, resolver wiring.
  - Resolver: `src/resolver/index.ts` — handlers for `ai_chat_request`, assets, typing/ping, Redis publish, S3 finalize.
  - Prisma Service: `src/prisma/index.ts` — DB ops for conversations, messages, attachments, provider key decrypt/lookup.

- Packages
  - Types: `packages/types/src/events.ts`, `src/models.ts` (provider/model mapping, defaults, display names).
  - Redis: `packages/redis-service/src/service/index.ts`, `src/pubsub/enhanced-client.ts`, `src/pubsub/channels.ts`.
  - S3: `packages/storage-s3/src/s3/index.ts` (presign, upload, finalize, sign download, list/copy/delete, MIME/EXT helpers).
  - Credentials: `packages/credentials-service/src/creds/index.ts` (Secrets Manager fetch + cache).
  - Encryption: `packages/encryption/src/encryption/index.ts` (AES‑256‑GCM for user API keys).
  - Key Validation: `packages/key-validator/src/http/index.ts`.

## Development

### Prerequisites

- Node 22+, pnpm 9+ (`corepack enable` recommended)
- Postgres (for Prisma), Redis (TLS capable if using cloud instance)
- AWS creds/profile for S3 + Secrets Manager (dev or prod)

### Install & Run

```bash
pnpm install

# Run everything (web + ws-server) with Turbo
pnpm dev

# Or run one app
pnpm run:web        # Next.js dev on :3030
pnpm run:ws-server  # WS server dev
```

### Database (Web app)

```bash
pnpm --filter=@slipstream/web db:generate  # prisma generate
pnpm --filter=@slipstream/web db:migrate   # dev migrations
pnpm --filter=@slipstream/web db:deploy    # deploy migrations
```

### Build Targets

```bash
pnpm build:ui
pnpm build:redis-service
pnpm build:credentials
pnpm build:encryption
pnpm build:key-validator
pnpm build:types
pnpm build:storage-s3
pnpm build:ws-server
pnpm build:web
```

## Environment

- Turbo passes many envs via `turbo.json` (`globalEnv`).
- Secrets are typically sourced from AWS Secrets Manager via `credentials-service`.
- Important keys: Postgres (`DATABASE_URL`/`POSTGRES_*`), Redis (`REDIS_URL`, TLS certs), S3 (`AWS_REGION`, `ASSETS_BUCKET`, `GEN_BUCKET`), auth (`AUTH_*`, `AUTH_SECRET`), provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `X_AI_KEY`, etc.), `ENCRYPTION_KEY` (hex) for API key encryption.

## Deployment Notes

- Web: deploy to Vercel (Edge‑friendly Prisma, static assets, middleware for cookies) or any Next‑capable host.
- WS server: runs on ECS Fargate behind an ALB. The container image is built from `turborepo/Dockerfile` and pushed to ECR.
- Image build/push: use the root `deploy-ws-server-full.sh` which builds with `docker buildx` for `linux/amd64`, pushes to the ECR repo, then triggers rollout.
- Infra discovery: `aws-remote.sh` populates `remote/describe/**` with JSON “describe” outputs (cluster, service, subnets, SGs, etc.). These metadata files are gitignored and not committed.
- Task definition: `ws-server-taskdef.json` is maintained locally (gitignored) and/or managed via your infra tooling. Do not commit task definitions containing secrets.
- Migrations: `deploy-ws-server-full.sh` runs `prisma migrate deploy` as a one‑off ECS task (container override) before forcing a new ECS service deployment.
- Networking: ALB/Target Group fronts the Fargate service; WS hostname (e.g., `ws.<domain>`) maps to the ALB. TLS terminates at the ALB; the container listens on `:4000`.
- Secrets: prefer AWS Secrets Manager + ECS taskDefinition `secrets` entries for credentials. Avoid placing secrets in plain `environment` variables or committing long‑lived keys anywhere.
- Redis/Postgres/S3: ensure network access from the service to your managed Redis (TLS as required), Postgres (Prisma Accelerate or direct), and S3/R2 endpoints used for assets and generation buckets.
- Local dev: use the root `docker-compose.yml` for WS + Postgres + Redis + FastAPI; it overrides `DATABASE_URL` for the WS server to point at local Postgres.

## Security Considerations

- User provider API keys are stored encrypted (AES‑256‑GCM) with `ENCRYPTION_KEY`; decrypted on the server just‑in‑time for requests.
- WS handshake authorization validates active Prisma session for the provided email; profile geo data is persisted from cookies.
- Redis and S3 operations use minimal metadata and TTLs for resumable streams and presigned URLs.

## Repo Structure (abridged)

```
turborepo/
  apps/
    web/         # Next.js client (auth, chat, assets)
    ws-server/   # Node ws server (providers, assets, Redis)
  packages/
    types/           # EventTypeMap, models/providers
    redis-service/   # Redis client + typed pub/sub
    storage-s3/      # S3 utilities (presign, finalize, etc.)
    credentials-service/ # AWS Secrets Manager access
    encryption/      # AES-GCM for API keys
    key-validator/   # Provider key checks
    ui/              # Shared UI components
  tooling/           # Lint/format/ts config presets
  turbo.json         # Task graph config
  pnpm-workspace.yaml
```

## Typical Flows

- Ask a question with attachments:
  1) Client sends `asset_paste`/`asset_attached` → server returns presigned PUT instructions.
  2) Client uploads to S3 → sends `asset_upload_complete` → server finalizes and emits `asset_ready`.
  3) Client sends `ai_chat_request` with `batchId`/`draftId` → server streams `ai_chat_chunk` then `ai_chat_response`.

- Resume a stream after reconnect:
  - Server keeps `stream:state:<conversationId>` in Redis (chunks + metadata). On reconnect, server emits `stream:resumed` and a catch‑up `ai_chat_chunk` built from saved chunks.

---

Questions or improvements? The WS protocol and flows are defined in `packages/types`—start there for changes.
