#!/usr/bin/env bash
set -euo pipefail

LOCAL=http://localhost:3030
ROOT=https://chat.d0paminedriven.com
DEV=https://dev.chat.d0paminedriven.com
STG=https://stg.chat.d0paminedriven.com

CFG=$(jq -n --arg local "$LOCAL" --arg root "$ROOT" --arg dev "$DEV" --arg stg "$STG" '{
  CORSRules: [
    {
      AllowedOrigins: [$local, $root, $dev, $stg],
      AllowedMethods: ["PUT","POST","DELETE"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag","x-amz-request-id","x-amz-version-id"],
      MaxAgeSeconds: 3000
    },
    {
      AllowedOrigins: [$local, $root, $dev, $stg],
      AllowedMethods: ["GET","HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag","x-amz-request-id","x-amz-version-id"],
      MaxAgeSeconds: 3000
    }
  ]
}')

for B in ws-server-assets-dev ws-server-assets-prod; do
  aws s3api put-bucket-cors --bucket "$B" --cors-configuration "$CFG"
done

aws s3api get-bucket-cors --bucket ws-server-assets-dev
