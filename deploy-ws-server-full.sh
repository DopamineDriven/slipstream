#!/usr/bin/env bash
set -euo pipefail

echo "📸 Syncing infrastructure state (pre-deployment)..."
./aws-remote.sh

echo "📦 Building and pushing Docker image..."

docker buildx create --name myWsServerBuilder --use 2>/dev/null || docker buildx use myWsServerBuilder

docker buildx build \
  --platform linux/amd64 \
  -f turborepo/Dockerfile \
  -t 782904577755.dkr.ecr.us-east-1.amazonaws.com/t3-chat-clone-ws-server:latest \
  --cache-from type=registry,ref=782904577755.dkr.ecr.us-east-1.amazonaws.com/t3-chat-clone-ws-server:buildcache \
  --cache-to type=registry,ref=782904577755.dkr.ecr.us-east-1.amazonaws.com/t3-chat-clone-ws-server:buildcache,mode=max \
  --push \
  turborepo/

echo "🔄 Running database migrations..."
# Everything comes from your cached describe files!
CLUSTER_ARN=$(jq -r '.clusters[0].clusterArn' remote/describe/cluster/t3-chat-clone-cluster.json)
SERVICE_NAME=$(jq -r '.services[0].serviceName' remote/describe/service/ws-server.json)
TASK_DEF=$(jq -r '.services[0].taskDefinition' remote/describe/service/ws-server.json | xargs basename)
SUBNET_IDS=$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.subnets | join(",")' remote/describe/service/ws-server.json)
SECURITY_GROUP=$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.securityGroups[0]' remote/describe/service/ws-server.json)

# Run migration task
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER_ARN" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides": [{"name": "ws-server", "command": ["sh", "-c", "cd apps/ws-server && npx prisma migrate deploy"]}]}' \
  --query 'tasks[0].taskArn' \
  --output text)

aws ecs wait tasks-stopped --cluster "$CLUSTER_ARN" --tasks "$TASK_ARN"

EXIT_CODE=$(aws ecs describe-tasks \
  --cluster "$CLUSTER_ARN" \
  --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' \
  --output text)

if [ "$EXIT_CODE" != "0" ]; then
  echo "❌ Migration failed!"
  exit 1
fi

echo "🚀 Updating ECS service..."
aws ecs update-service \
  --cluster "$CLUSTER_ARN" \
  --service "$SERVICE_NAME" \
  --force-new-deployment

echo "📸 Syncing infrastructure state (post-deployment)..."
./aws-remote.sh

echo "✅ Deployment complete!"