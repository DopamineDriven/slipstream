#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer MOTION_PLUS_TOKEN from the root .env, fall back to .npmrc
TOKEN=""
if [[ -f "$REPO_ROOT/.env" ]]; then
    TOKEN="$(grep -oPm1 '(?<=^MOTION_PLUS_TOKEN=).*' "$REPO_ROOT/.env" | tr -d '[:space:]"'"'" || true)"
fi
if [[ -z "$TOKEN" && -f "$REPO_ROOT/.npmrc" ]]; then
    TOKEN="$(grep -oPm1 '(?<=//api\.motion\.dev/:_authToken=).*' "$REPO_ROOT/.npmrc" | tr -d '[:space:]' || true)"
fi

if [[ -z "$TOKEN" ]]; then
    echo -e "${RED}✗${NC} No MOTION_PLUS_TOKEN in .env and no //api.motion.dev/:_authToken in .npmrc" >&2
    exit 1
fi

# The Motion+ registry has no queryable metadata endpoint, so fetch the
# `latest` tarball and read the version out of its package.json
LATEST="$(curl -fsS -H "Authorization: Bearer $TOKEN" \
    "https://api.motion.dev/registry.tgz?package=motion-plus&version=latest" \
    | tar -xzO package/package.json \
    | grep -m1 '"version"' \
    | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"

PINNED="$(grep -oPm1 '(?<=package=motion-plus&version=)[0-9][^"]*' "$REPO_ROOT/packages/ui/package.json" || true)"

echo -e "${GREEN}→${NC} latest motion-plus: ${GREEN}${LATEST}${NC}"

if [[ -z "$PINNED" ]]; then
    echo -e "${YELLOW}⚠${NC} no pinned motion-plus tarball URL found in packages/ui/package.json"
elif [[ "$PINNED" == "$LATEST" ]]; then
    echo -e "${GREEN}→${NC} pinned version:     ${GREEN}${PINNED}${NC} (up to date)"
else
    echo -e "${YELLOW}⚠${NC} pinned version:     ${YELLOW}${PINNED}${NC} (behind — update the registry.tgz URLs)"
fi
