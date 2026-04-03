#!/usr/bin/env bash
set -euo pipefail


REGION=us-east-1
SUBDOMAIN=assets-dev
CERT_ARN=$(jq -r '.CertificateArn' infra/remote/describe/acm/"$SUBDOMAIN".json)

aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$REGION" \
  --query "Certificate.DomainValidationOptions[0].ResourceRecord" \
  >infra/remote/describe/acm/"$SUBDOMAIN"-records.json
