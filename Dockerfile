# syntax=docker/dockerfile:1.4
FROM node:26-trixie-slim AS base

# Python 3.13 via apt — pythonia spawns `python3` from PATH
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Builder ---
FROM base AS builder
# toolchain for node-gyp fallback if a native addon lacks a Node 26 prebuild
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g turbo@2.10.9 pnpm@11.21.0
COPY turbo.json pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY . .
ENV TURBO_TELEMETRY=0
RUN turbo prune --scope=@slipstream/ws-server --docker

# --- Installer ---
FROM builder AS installer

ARG MOTION_PLUS_TOKEN
ENV MOTION_PLUS_TOKEN=$MOTION_PLUS_TOKEN

# cp pruned pnpm files and sources
COPY --from=builder /app/out/json/ ./
COPY --from=builder /app/.npmrc ./

RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    --mount=type=cache,id=pnpm-registry,target=/root/.npm \
    pnpm install --no-frozen-lockfile

COPY --from=builder /app/out/full/ ./
RUN pnpm build:ws-server

# --- Runner ---
FROM base AS runner

RUN groupadd --system --gid 1001 wsserver && \
    useradd --system --uid 1001 --gid wsserver --create-home wsserver

# install Python packages (--break-system-packages: trixie's apt Python is PEP 668 externally-managed)
RUN python3 -m pip install --no-cache-dir --break-system-packages xai-sdk==1.4.0 voyageai==0.3.7

WORKDIR /app
COPY --from=installer --chown=1001:1001 /app .

USER wsserver
EXPOSE 4000
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

CMD ["node", "apps/ws-server/dist/index.js"]
