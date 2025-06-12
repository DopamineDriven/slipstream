# --- Base image for all stages
FROM node:24-alpine AS base

# libc6-compat only needed for some node modules (e.g., sharp). Safe to include for widest compatibility.
RUN apk add --no-cache libc6-compat

# Make sure to set working directory
WORKDIR /app

# --- Builder: Turbo prune for workspace
FROM base AS builder

# Install turbo and pnpm globally
RUN npm install -g turbo pnpm

# Copy monorepo root files for turbo
COPY turbo.json ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy entire monorepo (needed for turbo prune to analyze deps)
COPY . .

RUN turbo prune --docker apps/ws-server

# install deps for pruned app
FROM base AS installer

# cp pruned pnpm files and sources
COPY --from=builder /app/out/json/ ./

# install pruned deps prod only
RUN pnpm install --frozen-lockfile --prod

# cp turbo pruned src
COPY --from=builder /app/out/full/ ./

# --- Build the actual app (and any required deps)
RUN pnpm turbo run build --filter=ws-server...

# --- prod runtime, smallest image, secure user
FROM base AS runner

# security -- create app user wsserver
RUN addgroup -S wsserver && adduser -S wsserver -G wsserver

USER wsserver

WORKDIR /app

# cp built app and runtime deps
COPY --from=installer /app .

EXPOSE 8080

CMD ["node", "apps/ws-server/dist/index.js"]
