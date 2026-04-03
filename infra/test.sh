#!/usr/bin/env bash
set -euo pipefail

TASKDEF_IMAGE=$(jq -r '.taskDefinition.containerDefinitions[0].image' infra/remote/describe/taskdef/ws-server.json)

ECS_REGISTRY_REF_WS=${TASKDEF_IMAGE%%:*}

echo "$TASKDEF_IMAGE | $ECS_REGISTRY_REF_WS"
