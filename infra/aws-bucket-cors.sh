#!/usr/bin/env bash
set -euo pipefail

# Old domains (keeping for backwards compat)
LOCAL=http://localhost:3030
LOCAL_PY=http://localhost:8000
ROOT_OLD=https://chat.d0paminedriven.com
DEV_OLD=https://dev.chat.d0paminedriven.com
STG_OLD=https://stg.chat.d0paminedriven.com
PY_OLD=https://py.d0paminedriven.com

# New domains
ROOT_NEW=https://chat.aicoalesce.com
DEV_NEW=https://dev.chat.aicoalesce.com
STG_NEW=https://stg.chat.aicoalesce.com
PY_NEW=https://py.aicoalesce.com
WS_NEW=https://ws.aicoalesce.com
ADOBE_PDF=https://pdf-services.adobe.io
ADOBE_PDF_UE1=https://pdf-services-ue1.adobe.io
ADOBE_PDF_EW1=https://pdf-services-ew1.adobe.io
ADOBE_PDF_COM=https://pdf-services.adobe.com
ADOBE_IMS_NA1=https://ims-na1.adobelogin.com
ADOBE_IMS_EU1=https://ims-eu1.adobelogin.com
ADOBE_DC_IO=https://dc-api.adobe.io
ADOBE_DC_COM=https://dc-api.adobe.com

CFG=$(jq -n \
  --arg local "$LOCAL" \
  --arg local_py "$LOCAL_PY" \
  --arg root_old "$ROOT_OLD" \
  --arg dev_old "$DEV_OLD" \
  --arg stg_old "$STG_OLD" \
  --arg py_old "$PY_OLD" \
  --arg root_new "$ROOT_NEW" \
  --arg dev_new "$DEV_NEW" \
  --arg stg_new "$STG_NEW" \
  --arg py_new "$PY_NEW" \
  --arg ws_new "$WS_NEW" \
  --arg adobe_pdf "$ADOBE_PDF" \
  --arg adobe_pdf_ue1 "$ADOBE_PDF_UE1" \
  --arg adobe_pdf_ew1 "$ADOBE_PDF_EW1" \
  --arg adobe_pdf_com "$ADOBE_PDF_COM" \
  --arg adobe_ims_na1 "$ADOBE_IMS_NA1" \
  --arg adobe_ims_eu1 "$ADOBE_IMS_EU1" \
  --arg adobe_dc_io "$ADOBE_DC_IO" \
  --arg adobe_dc_com "$ADOBE_DC_COM" \
'{
  CORSRules: [
    {
      AllowedOrigins: [
        $local, 
        $local_py,
        $root_old, $dev_old, $stg_old, $py_old,
        $root_new, $dev_new, $stg_new, $py_new, $ws_new,
        $adobe_pdf, $adobe_pdf_ue1, $adobe_pdf_ew1, $adobe_pdf_com,
        $adobe_ims_na1, $adobe_ims_eu1,
        $adobe_dc_io, $adobe_dc_com
      ],
      AllowedMethods: ["GET","HEAD","PUT","POST","DELETE"],
      AllowedHeaders: ["*"],
      ExposeHeaders: [
        "ETag",
        "x-amz-request-id",
        "x-amz-version-id",
        "x-amz-checksum-type",
        "x-amz-checksum-crc32",
        "x-amz-checksum-crc32c",
        "x-amz-checksum-crc64nvme",
        "x-amz-checksum-sha1",
        "x-amz-checksum-sha256",
        "Content-Range",
        "Accept-Ranges",
        "Content-Length",
        "Content-Type",
        "Last-Modified",
        "Content-Encoding",
        "Cache-Control"
      ],
      MaxAgeSeconds: 3000
    }
  ]
}')

echo "Updating CORS for all buckets with both old and new domains..."
for B in ws-server-assets-dev ws-server-assets-prod py-gen-assets-dev py-gen-assets-prod; do
  echo "Updating $B..."
  aws s3api put-bucket-cors --bucket "$B" --cors-configuration "$CFG"
done

echo "Verifying CORS configuration..."
aws s3api get-bucket-cors --bucket ws-server-assets-dev | jq '.CORSRules[0].AllowedOrigins'