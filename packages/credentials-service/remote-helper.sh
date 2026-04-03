#!/usr/bin/env bash
set -euo pipefail

REGION=us-east-1
NAME=$(jq -r '.Name' src/service/__out__/credentials.json)
CURRENT_SECRETS=$(jq -c '.secrets[0]' src/service/__out__/secrets.json)

echo "→ Updating secret $NAME"

aws secretsmanager put-secret-value \
  --secret-id "$NAME" \
  --region "$REGION" \
  --secret-string "$CURRENT_SECRETS" \
  > src/service/__out__/"$NAME".json

echo "✅ Secret $NAME updated and response saved."
