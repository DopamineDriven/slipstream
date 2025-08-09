#!/usr/bin/env bash
set -euo pipefail

read NAME PROTO PORT HCP HCPORT < <(
  jq -r '.TargetGroups[] | [.TargetGroupName,.Protocol,.Port,.HealthCheckProtocol,.HealthCheckPort] | @tsv' \
    remote/describe/tg/ws-server.json
)

if [[ "$PROTO" == "HTTPS" && "$HCP" == "HTTPS" ]]; then
  echo "E2E_TLS=true  # ALB->task is TLS ($PROTO:$PORT)"
else
  echo "E2E_TLS=false # ALB->task is $PROTO:$PORT"
fi
