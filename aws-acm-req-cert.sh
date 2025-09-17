#!/usr/bin/env bash
set -euo pipefail

REGION=us-east-1
SUBDOMAIN=assets-dev
DOMAIN=aicoalesce

aws acm request-certificate \
  --domain-name "$SUBDOMAIN"."$DOMAIN".com \
  --validation-method DNS \
  --region "$REGION" \
  >remote/describe/acm/"$SUBDOMAIN"-"$DOMAIN".json