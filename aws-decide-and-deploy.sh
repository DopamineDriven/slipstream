#!/usr/bin/env bash
set -euo pipefail


: "${REGION:=us-east-1}"
: "${TASK_ROLE_NAME:=wsServerTaskRole}"        
: "${EXEC_ROLE_NAME:=ecsTaskExecutionRole}"   
: "${FORCE_ROLL:=1}"                         
: "${PATCH_SRC:=./ws-server-taskdef.json}"    

CLUSTER_JSON="remote/describe/cluster/t3-chat-clone-cluster.json"
SERVICE_JSON="remote/describe/service/ws-server.json"
PATCHED_OUT="remote/updates/taskdef/ws-server.json"
REV_OUT="remote/describe/revisions/taskdef/ws-server.json"

mkdir -p "$(dirname "$PATCHED_OUT")" "$(dirname "$REV_OUT")"


CLUSTER_ARN=$(jq -r '.clusters[0].clusterArn' "$CLUSTER_JSON")
SERVICE_NAME=$(jq -r '.services[0].serviceName' "$SERVICE_JSON")
[[ -n "$CLUSTER_ARN" && -n "$SERVICE_NAME" ]]

CURR_TD_ARN=$(aws ecs describe-services \
  --region "$REGION" --cluster "$CLUSTER_ARN" --services "$SERVICE_NAME" \
  --query 'services[0].taskDefinition' --output text)

read -r CURR_TASK_ROLE CURR_EXEC_ROLE <<<"$(
  aws ecs describe-task-definition --region "$REGION" --task-definition "$CURR_TD_ARN" \
    --query '[taskDefinition.taskRoleArn, taskDefinition.executionRoleArn]' --output text
)"


ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
DESIRED_TASK_ROLE_ARN=$(aws iam get-role --role-name "$TASK_ROLE_NAME" --query 'Role.Arn' --output text)
DESIRED_EXEC_ROLE_ARN=$(aws iam get-role --role-name "$EXEC_ROLE_NAME" --query 'Role.Arn' --output text)

echo "Current TD: $CURR_TD_ARN"
echo " - taskRoleArn:      ${CURR_TASK_ROLE:-<none>}"
echo " - executionRoleArn: ${CURR_EXEC_ROLE:-<none>}"
echo "Desired:"
echo " - taskRoleArn:      $DESIRED_TASK_ROLE_ARN"
echo " - executionRoleArn: $DESIRED_EXEC_ROLE_ARN"

NEED_NEW_TD=0
[[ "${CURR_TASK_ROLE:-}"      != "$DESIRED_TASK_ROLE_ARN" ]] && NEED_NEW_TD=1
[[ "${CURR_EXEC_ROLE:-}"      != "$DESIRED_EXEC_ROLE_ARN" ]] && NEED_NEW_TD=1


if [[ -f "$PATCH_SRC" ]]; then SRC="$PATCH_SRC"
else SRC="remote/describe/taskdef/ws-server.json"
fi

if [[ "$NEED_NEW_TD" == "1" ]]; then
  echo "=> Roles changed: registering a NEW task definition revision."
  jq --arg tr "$DESIRED_TASK_ROLE_ARN" --arg er "$DESIRED_EXEC_ROLE_ARN" '
    .taskRoleArn = $tr
    | .executionRoleArn = $er
    | del(."$schema")
  ' "$SRC" | jq -c '.' > "$PATCHED_OUT"

  aws ecs register-task-definition \
    --region "$REGION" \
    --cli-input-json "file://$PATCHED_OUT" \
    > "$REV_OUT"

  NEW_TD_ARN=$(jq -r '.taskDefinition.taskDefinitionArn' "$REV_OUT")
  echo "✓ Registered $NEW_TD_ARN — updating service…"

  aws ecs update-service \
    --region "$REGION" \
    --cluster "$CLUSTER_ARN" \
    --service "$SERVICE_NAME" \
    --task-definition "$NEW_TD_ARN" \
    --force-new-deployment >/dev/null

  echo "✓ Service updated to new TD and rollout started."
else
  echo "=> Role ARNs match. No new task definition needed."
  if [[ "$FORCE_ROLL" == "1" ]]; then
    echo "→ Forcing a new deployment to recycle tasks."
    aws ecs update-service \
      --region "$REGION" \
      --cluster "$CLUSTER_ARN" \
      --service "$SERVICE_NAME" \
      --force-new-deployment >/dev/null
    echo "✓ Rollout triggered without changing task definition."
  else
    echo "ℹ Skipping rollout. Existing tasks will use the updated role policies after IAM propagation."
  fi
fi
