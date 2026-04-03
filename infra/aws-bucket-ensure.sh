#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-east-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

ALL_BUCKETS=(ws-server-assets-dev ws-server-assets-prod py-gen-assets-dev py-gen-assets-prod)
CORS_BUCKETS=(ws-server-assets-dev ws-server-assets-prod) # only browser-facing buckets

create_bucket() {
  local b="$1"
  if aws s3api head-bucket --bucket "$b" 2>/dev/null; then
    echo "✓ $b exists"
  else
    if [[ "$REGION" == "us-east-1" ]]; then
      aws s3api create-bucket --bucket "$b"
    else
      aws s3api create-bucket --bucket "$b" \
        --create-bucket-configuration LocationConstraint="$REGION"
    fi
    echo "✓ created $b"
  fi
}

# Account-level Block Public Access (safe default)
aws s3control put-public-access-block --account-id "$ACCOUNT_ID" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

for b in "${ALL_BUCKETS[@]}"; do
  create_bucket "$b"

  # Bucket-level Block Public Access
  aws s3api put-public-access-block --bucket "$b" \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

  # Object Ownership = BucketOwnerEnforced (ACLs off)
  aws s3api put-bucket-ownership-controls --bucket "$b" \
    --ownership-controls '{"Rules":[{"ObjectOwnership":"BucketOwnerEnforced"}]}'

  # Abort incomplete MPUs after 7 days
  aws s3api put-bucket-lifecycle-configuration --bucket "$b" \
    --lifecycle-configuration '{"Rules":[{"ID":"AbortIncompleteMPUs","Status":"Enabled","Filter":{"Prefix":""},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}]}'
done

# CORS only where browsers talk directly to S3
CORS_JSON='{"CORSRules":[
  {"AllowedOrigins":["http://localhost:3030","http://localhost:8000","https://chat.d0paminedriven.com","https://dev.chat.d0paminedriven.com","https://stg.chat.d0paminedriven.com","https://py.d0paminedriven.com"],
   "AllowedMethods":["PUT","POST","DELETE"],"AllowedHeaders":["*"],
   "ExposeHeaders":["ETag","x-amz-request-id","x-amz-version-id"],"MaxAgeSeconds":3000},
  {"AllowedOrigins":["http://localhost:3030","http://localhost:8000","https://chat.d0paminedriven.com","https://dev.chat.d0paminedriven.com","https://stg.chat.d0paminedriven.com","https://py.d0paminedriven.com"],
   "AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"],
   "ExposeHeaders":["ETag","x-amz-request-id","x-amz-version-id"],"MaxAgeSeconds":3000}
]}'
for b in "${CORS_BUCKETS[@]}"; do
  aws s3api put-bucket-cors --bucket "$b" \
    --cors-configuration "$CORS_JSON" \
    --expected-bucket-owner "$ACCOUNT_ID"
done

echo "Done. Verify:"
echo "aws s3api get-public-access-block --bucket ws-server-assets-dev"
echo "aws s3api get-bucket-ownership-controls --bucket ws-server-assets-dev"
echo "aws s3api get-bucket-cors --bucket ws-server-assets-dev"
