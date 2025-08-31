#!/usr/bin/env bash
set -euo pipefail

REGION=us-east-1
SUBDOMAIN=assets-dev
CERT_ARN=$(jq -r '.CertificateArn' remote/describe/acm/"$SUBDOMAIN".json)

# Check current status
STATUS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$REGION" \
  --query 'Certificate.Status' \
  --output text)

echo "Current status: $STATUS"

if [ "$STATUS" != "ISSUED" ]; then
    echo "Waiting for validation..."
    aws acm wait certificate-validated \
      --certificate-arn "$CERT_ARN" \
      --region "$REGION"
    echo "Certificate validated!"
else
    echo "Certificate already validated"
fi