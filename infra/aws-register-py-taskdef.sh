#!/usr/bin/env bash
set -euo pipefail

CLUSTER_ARN=$(jq -r '.clusters[0].clusterArn' infra/remote/describe/cluster/t3-chat-clone-cluster.json)
SERVICE_NAME=$(jq -r '.services[0].serviceName' infra/remote/describe/service/t3-chat-clone-python-service.json)
TASKDEF_SOURCE=$(jq -c '.' infra/python-service-taskdef.json)
echo "$CLUSTER_ARN"
echo "$SERVICE_NAME"
echo "$TASKDEF_SOURCE"


aws ecs register-task-definition \
  --cli-input-json "$TASKDEF_SOURCE" \
  >infra/remote/describe/revisions/taskdef/t3-chat-clone-python-service.json
