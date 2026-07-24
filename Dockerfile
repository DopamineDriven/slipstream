# syntax=docker/dockerfile:1.4
FROM node:26-bullseye-slim AS base

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    wget \
    ca-certificates \
    openssl \
    build-essential \
    libssl-dev \
    libffi-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncurses5-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libxml2-dev \
    libxmlsec1-dev \
    liblzma-dev \
    && rm -rf /var/lib/apt/lists/*

# Compile Python 3.10 with proper venv support
RUN wget https://www.python.org/ftp/python/3.10.0/Python-3.10.0.tgz \
    && tar -xzf Python-3.10.0.tgz \
    && cd Python-3.10.0 \
    && ./configure --enable-optimizations --with-ensurepip=install \
    && make -j$(nproc) \
    && make altinstall \
    && cd .. \
    && rm -rf Python-3.10.0 Python-3.10.0.tgz

# Install pip properly
RUN wget https://bootstrap.pypa.io/get-pip.py \
    && python3.10 get-pip.py \
    && rm get-pip.py

# Update alternatives
RUN update-alternatives --install /usr/bin/python3 python3 /usr/local/bin/python3.10 1 \
    && update-alternatives --install /usr/bin/pip3 pip3 /usr/local/bin/pip3.10 1

WORKDIR /app

# --- Builder ---
FROM base AS builder
RUN npm install -g turbo@2.10.6 pnpm@11.17.0
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

# install Python packages
RUN python3.10 -m pip install --no-cache-dir --upgrade pip \
    && python3.10 -m pip install --no-cache-dir xai-sdk==1.4.0 voyageai==0.3.7 # Note: == not =

WORKDIR /app
COPY --from=installer /app .

RUN chown -R wsserver:wsserver /app

USER wsserver
EXPOSE 4000
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

CMD ["node", "apps/ws-server/dist/index.js"]
