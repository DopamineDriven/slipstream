FROM node:24-alpine AS base

# libc6-compat only needed for some node modules (e.g., sharp). Safe to include for widest compatibility.
RUN apk add --no-cache libc6-compat

# Make sure to set working directory
WORKDIR /app

# --- Builder: Turbo prune for workspace
FROM base AS builder

# Install turbo and pnpm globally
RUN npm install -g turbo@2.5.4 pnpm@10.12.1

# Copy monorepo root files for turbo
COPY turbo.json pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./

# Copy entire monorepo (needed for turbo prune to analyze deps)
COPY . .

RUN turbo prune --docker @t3-chat-clone/ws-server

# install deps for pruned app
FROM builder AS installer

# cp pruned pnpm files and sources
COPY --from=builder /app/out/json/ ./

# install pruned deps prod only
RUN pnpm install --no-frozen-lockfile

# cp turbo pruned src
COPY --from=builder /app/out/full/ ./

# --- Build the actual app (and any required deps)
RUN pnpm build:ws-server

# --- prod runtime, smallest image, secure user
FROM base AS runner

# security -- create app user wsserver
RUN addgroup -S wsserver && adduser -S wsserver -G wsserver

USER wsserver

WORKDIR /app

# cp built app and runtime deps
COPY --from=installer /app .

EXPOSE 4000

CMD ["node", "apps/ws-server/dist/index.js"]
