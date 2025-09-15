## Slipstream — Polyrepo Overview

Monorepo + microservice setup for a realtime, multi‑model AI chat app. The web client and Node WebSocket server live in a Turborepo workspace. A separate Python FastAPI microservice handles generative asset tasks. Infra scripts support AWS ECS Fargate deployments.

### Architecture

- Web (`turborepo/apps/web`): Next.js 15 + React 19 client with NextAuth v5. Connects to the WS server over typed events. Uses Prisma (Edge) for persistence.
- WS Server (`turborepo/apps/ws-server`): Node `ws` server. Authenticates sessions, orchestrates provider calls (OpenAI, Anthropic, Gemini, xAI, Llama, Vercel v0), streams tokens, manages asset presigned uploads to S3/R2, mirrors stream state to Redis, and persists via Prisma.
- Python Service (`python/`): FastAPI + Uvicorn microservice for generative asset workflows (e.g., image generation). Called from the WS server via `FASTAPI_URL`.
- Shared Packages (`turborepo/packages`): Types (WS protocol), Redis pub/sub client, S3 utilities, AWS Secrets Manager client, AES‑GCM encryption, UI, key validation.
- Data Stores: Postgres (Prisma), Redis (pub/sub + resumable stream state), S3/R2 (assets + generated media).

### Repos & Entrypoints

- `turborepo/` → See `turborepo/README.md` for details and developer commands.
- `python/` → See `python/README.md` for endpoints and local/dev notes.
- Infra scripts (root):
  - `deploy-ws-server-full.sh`: Build/push WS image to ECR, run Prisma migrations as an ECS one‑off task, then force an ECS service deploy.
  - `aws-remote.sh`: Populates `remote/describe/**` with cached AWS “describe” JSON used by scripts (gitignored).

### Local Development

- Prereqs: Node 22+, pnpm 9+, Docker, Python 3.11+ (for local service), PDM.
- Install: `cd turborepo && pnpm install` (Turbo workspace).
- Run (JS apps): `pnpm dev` in `turborepo/` to start web + ws‑server.
- Full local stack (root): `docker compose up -d` to start WS + FastAPI + Redis + Postgres.

#### Python (PDM)

- Package manager: The Python service uses PDM (not pip/poetry).
- Install PDM: `pipx install pdm` (recommended) or `pip install pdm`.
- Setup deps: `cd python && pdm sync` (or `pdm install`).
- Run service: `pdm run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.

### Deployment

- Web: deploy to Vercel or any Next‑capable platform (Edge‑friendly Prisma client).
- WS Server: containerized and deployed to ECS Fargate behind an ALB. Image built from `turborepo/Dockerfile` → pushed to ECR. Migrations run via one‑off ECS task, then service rollout.
- Python Service: also deployed to ECS Fargate in the same cluster/ALB, with its own task definition and security group.
- Infra metadata and taskdef JSONs are gitignored:
  - `remote/describe/**` contains AWS “describe” outputs populated by `aws-remote.sh`.
  - `ws-server-taskdef.json` and similar task definition files are maintained locally and not committed.

### Security Considerations

- Prefer IAM Task Roles + AWS Secrets Manager/SSM Parameters for secrets. Avoid committing secrets or placing them in plain `environment` in task defs.
- User API keys are stored encrypted (AES‑256‑GCM) and decrypted server‑side just‑in‑time.
- WebSocket protocol is strongly typed via shared `packages/types` to reduce mismatch and injection risk.

### Repository Map

- `turborepo/`: Next.js web, Node WS server, shared packages, Turbo config.
- `python/`: FastAPI microservice for generative assets.
- `docker/`, `docker-compose.yml`: Local build/runtime utilities and stack.
- `remote/describe/**`: Cached AWS describe outputs (gitignored).
- `deploy-ws-server-full.sh`, `aws-remote.sh`: Deployment automation.

Questions or improvements? Start with the protocol and types under `turborepo/packages/types` and the Python API in `python/app/`.
