#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="motion-plus"
PACKAGE_VERSION="2.8.0"
TARBALL_DIRS=("./apps/web/.tarballs" "./packages/ui/.tarballs")
TARBALL_NAME="${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz"
SOURCE="${TARBALL_DIRS[0]}/${TARBALL_NAME}"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

for dir in "${TARBALL_DIRS[@]}"; do
  mkdir -p "$dir"
done

if [ -z "${MOTION_PLUS_TOKEN:-}" ] && [ ! -f "$SOURCE" ]; then
  echo "MOTION_PLUS_TOKEN not set and ${SOURCE} is missing."
  echo "Cannot fetch ${PACKAGE_NAME}@${PACKAGE_VERSION}."
  exit 1
fi

if [ ! -f "$SOURCE" ]; then
  tmp="$(mktemp "${SOURCE}.XXXX")"
  trap 'rm -f "$tmp"' EXIT

  curl --fail --show-error --silent --location \
    --retry 3 --retry-all-errors \
    -o "$tmp" \
    "https://api.motion.dev/registry.tgz?package=${PACKAGE_NAME}&version=${PACKAGE_VERSION}&token=${MOTION_PLUS_TOKEN}"

  mv "$tmp" "$SOURCE"
  trap - EXIT
  echo "${PACKAGE_NAME}@${PACKAGE_VERSION} fetched successfully"
fi

for dir in "${TARBALL_DIRS[@]:1}"; do
  cp -f "$SOURCE" "${dir}/${TARBALL_NAME}"
  echo "copied ${PACKAGE_NAME}@${PACKAGE_VERSION} → ${dir}"
done
