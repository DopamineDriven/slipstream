#!/usr/bin/env bash
set -euo pipefail

REGION=us-east-1
SUBDOMAIN=assets-dev

aws acm request-certificate \
  --domain-name "$SUBDOMAIN".d0paminedriven.com \
  --validation-method DNS \
  --region "$REGION" \
  >remote/describe/acm/"$SUBDOMAIN".json