#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v jq >/dev/null || { echo -e "${RED}✗${NC} jq is required" >&2; exit 1; }

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
    | jq -r '.version')"

echo -e "${GREEN}→${NC} latest motion-plus: ${GREEN}${LATEST}${NC}"
echo

# Discovery pass: every workspace package.json under apps/ and packages/
mapfile -t PKG_JSONS < <(
    find "$REPO_ROOT/apps" "$REPO_ROOT/packages" \
        -maxdepth 2 -name package.json -not -path '*/node_modules/*' 2>/dev/null | sort
)

STATUS=0
FOUND=0

for pkg_json in "${PKG_JSONS[@]}"; do
    # The dependency spec, wherever it lives
    spec="$(jq -r '
        (.dependencies["motion-plus"]
         // .devDependencies["motion-plus"]
         // .optionalDependencies["motion-plus"]
         // empty)
    ' "$pkg_json")"

    [[ -z "$spec" ]] && continue
    FOUND=$((FOUND + 1))

    ws="${pkg_json#"$REPO_ROOT"/}"
    ws="${ws%/package.json}"
    label="$(printf '%-14s' "$ws")"

    # Extract the pinned version out of the tarball URL spec
    pinned="$(jq -rn --arg s "$spec" \
        '$s | capture("version=(?<v>[0-9][^&\"]*)") .v' 2>/dev/null || true)"

    if [[ -z "$pinned" ]]; then
        # Spec exists but isn't a version-pinned tarball URL (e.g. version=latest)
        echo -e "${YELLOW}⚠${NC} ${label} unpinned spec: ${YELLOW}${spec}${NC}"
        STATUS=1
    elif [[ "$pinned" == "$LATEST" ]]; then
        echo -e "${GREEN}✓${NC} ${label} ${GREEN}${pinned}${NC} (up to date)"
    else
        echo -e "${YELLOW}⚠${NC} ${label} ${YELLOW}${pinned}${NC} (behind — update the registry.tgz URL)"
        STATUS=1
    fi
done

if [[ "$FOUND" -eq 0 ]]; then
    echo -e "${RED}✗${NC} no workspace declares motion-plus as a dependency" >&2
    exit 1
fi

if [[ "$STATUS" -ne 0 ]]; then
    echo
    echo -e "${YELLOW}⚠${NC} one or more workspaces need attention"
fi

exit "$STATUS"
