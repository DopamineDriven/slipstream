#!/usr/bin/env bash
set -euo pipefail

TASKDEF_REVISION_ARN=$(jq -r '.taskDefinition.taskDefinitionArn' remote/describe/revisions/taskdef/t3-chat-clone-python-service.json)
TASKDEF_VERSIONED_NAME=${TASKDEF_REVISION_ARN##*/}
CLUSTER_ARN=$(jq -r '.clusters[0].clusterArn' remote/describe/cluster/t3-chat-clone-cluster.json)
SERVICE_NAME=$(jq -r '.services[0].serviceName' remote/describe/service/t3-chat-clone-python-service.json)

aws ecs update-service \
  --cluster "$CLUSTER_ARN" \
  --service "$SERVICE_NAME" \
  --task-definition "$TASKDEF_VERSIONED_NAME" \
  >remote/describe/updates/taskdef/"$SERVICE_NAME".json