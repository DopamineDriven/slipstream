#!/usr/bin/env bash
set -euo pipefail

for O in \
  "http://localhost:3030" \
  "https://chat.d0paminedriven.com" \
  "https://dev.chat.d0paminedriven.com" \
  "https://stg.chat.d0paminedriven.com"
do
  echo "Testing $O"
  curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
    -H "Origin: $O" \
    -H "Access-Control-Request-Method: PUT" \
    "https://ws-server-assets-dev.s3.amazonaws.com/test-object"
done
