#!/usr/bin/env bash
set -euo pipefail

CLUSTER_ARN=$(jq -r '.clusters[0].clusterArn' remote/describe/cluster/t3-chat-clone-cluster.json)
SERVICE_NAME=$(jq -r '.services[0].serviceName' remote/describe/service/ws-server.json)
TASKDEF_SOURCE=$(jq -c '.' ws-server-taskdef.json)
echo "$CLUSTER_ARN"
echo "$SERVICE_NAME"
echo "$TASKDEF_SOURCE"


aws ecs register-task-definition \
  --cli-input-json "$TASKDEF_SOURCE" \
  >remote/describe/revisions/taskdef/ws-server.json
