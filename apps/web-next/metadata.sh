#!/usr/bin/env bash
set -euo pipefail

command -v magick >/dev/null 2>&1 || { echo >&2 "⚠️ magick not found; brew install imagemagick"; exit 1; }

MASTER="public/temp/dd-logo.svg"
OUTDIR="public/temp"
ICO_OUT="public/favicon.ico"

# Optimized sharpening values - more conservative for better quality
declare -a SIZES=(16    32     48     64     128    180    192    512)
declare -a SIGMAS=(0.8x1.2 0.6x1.0 0.5x0.8 0.4x0.6 0.3x0.5 0.2x0.4 0.1x0.3 0.1x0.2)

for i in "${!SIZES[@]}"; do
  size=${SIZES[$i]}
  sigma=${SIGMAS[$i]}
  echo "🎨 generating ${size}×${size}.png (σ=${sigma})"

  magick "$MASTER" \
    -background transparent \
    -colorspace p3 \
    -density 2400 \
    -resize "$((size*2))x$((size*2))" \
    -filter Lanczos \
    -resize "${size}x${size}" \
    -unsharp "${sigma}" \
    -quality 100 \
    -depth 8 \
    "${OUTDIR}/${size}x${size}.png"
done

echo "📦 bundling favicon.ico"
magick \
  "${OUTDIR}/16x16.png" \
  "${OUTDIR}/32x32.png" \
  "${OUTDIR}/48x48.png" \
  -colors 256 \
  "$ICO_OUT"

echo "✅ metadata asset generation complete"
