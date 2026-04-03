#!/usr/bin/env bash
set -euo pipefail

REGION=us-east-1
SUBDOMAIN=assets
CERT_ARN=$(jq -r '.CertificateArn' infra/remote/describe/acm/"$SUBDOMAIN".json)

# Check current status
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$REGION" \
  >infra/remote/describe/acm/"$SUBDOMAIN"-details.json

