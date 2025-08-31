#!/usr/bin/env bash
set -euo pipefail

REGION=us-east-1
SUBDOMAIN=assets
CERT_ARN=$(jq -r '.CertificateArn' remote/describe/acm/"$SUBDOMAIN".json)

aws acm wait certificate-validated \
  --certificate-arn "$CERT_ARN" \
  --region "$REGION"
