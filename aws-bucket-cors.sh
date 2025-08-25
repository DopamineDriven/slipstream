#!/usr/bin/env bash
set -euo pipefail

LOCAL=http://localhost:3030
LOCAL_PY=http://localhost:8000
ROOT=https://chat.d0paminedriven.com
DEV=https://dev.chat.d0paminedriven.com
STG=https://stg.chat.d0paminedriven.com
PY=https://py.d0paminedriven.com

CFG=$(jq -n --arg local "$LOCAL" --arg root "$ROOT" --arg dev "$DEV" --arg stg "$STG" --arg py "$PY" --arg local_py "$LOCAL_PY" '{
  CORSRules: [
    {
      AllowedOrigins: [$local, $root, $dev, $stg, $py, $local_py],
      AllowedMethods: ["GET","HEAD","PUT","POST","DELETE"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag","x-amz-request-id","x-amz-version-id","Content-Range","Accept-Ranges","Content-Length","Content-Type","Last-Modified","Cache-Control"],
      MaxAgeSeconds: 3000
    }
  ]
}')

for B in ws-server-assets-dev ws-server-assets-prod py-gen-assets-dev py-gen-assets-prod; do
  aws s3api put-bucket-cors --bucket "$B" --cors-configuration "$CFG"
done

aws s3api get-bucket-cors --bucket ws-server-assets-dev
