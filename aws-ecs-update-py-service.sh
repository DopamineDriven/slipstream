#!/usr/bin/env bash
set -euo pipefail

CLUSTER_ARN=$(jq -r '.clusters[0].clusterArn' remote/describe/cluster/t3-chat-clone-cluster.json)
SERVICE_NAME=$(jq -r '.services[0].serviceName' remote/describe/service/t3-chat-clone-python-service.json)
echo "$CLUSTER_ARN"
echo "$SERVICE_NAME"



aws ecs update-service \
  --cluster "$CLUSTER_ARN" \
  --service "$SERVICE_NAME" \
  --force-new-deployment