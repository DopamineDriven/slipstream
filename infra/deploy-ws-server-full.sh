#!/usr/bin/env bash
set -euo pipefail

# Docker prerequisite check
echo "🐳 Checking Docker status..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running!"
    echo ""
    if [[ $(uname -r) =~ microsoft|WSL ]]; then
        echo "To start Docker in WSL2:"
        echo "   1. Open Docker Desktop from Windows Start Menu"
        echo "   2. Ensure 'Use the WSL 2 based engine' is enabled in Docker settings"
        echo "   3. Wait for Docker to fully initialize (~30 seconds)"
        echo "   4. Run 'npm run deploy:ws-server' again"
    else
        echo "Please start Docker and try again."
    fi
    echo ""
    exit 1
fi

# Additional check for Docker buildx since you're using it
if ! docker buildx version > /dev/null 2>&1; then
    echo "❌ Docker buildx is not available!"
    echo "This is required for multi-platform builds."
    exit 1
fi

TASKDEF_IMAGE=$(jq -r '.taskDefinition.containerDefinitions[0].image' infra/remote/describe/taskdef/ws-server.json)

ECS_REGISTRY_REF_WS=${TASKDEF_IMAGE%%:*}

echo "✅ Docker is ready"
echo ""

echo "📸 Syncing infrastructure state (pre-deployment)..."
./infra/aws-remote.sh

echo "📦 Building and pushing Docker image..."

docker buildx create --name myWsServerBuilder --use 2>/dev/null || docker buildx use myWsServerBuilder

docker buildx build \
  --platform linux/amd64 \
  -f ./Dockerfile \
  -t $ECS_REGISTRY_REF_WS:latest \
  --cache-from type=registry,ref=$ECS_REGISTRY_REF_WS:buildcache \
  --cache-to type=registry,ref=$ECS_REGISTRY_REF_WS:buildcache,mode=max \
  --push \
  ./

echo "🔄 Running database migrations..."

CLUSTER_ARN=$(jq -r '.clusters[0].clusterArn' infra/remote/describe/cluster/t3-chat-clone-cluster.json)
SERVICE_NAME=$(jq -r '.services[0].serviceName' infra/remote/describe/service/ws-server.json)
TASK_DEF=$(jq -r '.services[0].taskDefinition' infra/remote/describe/service/ws-server.json | xargs basename)
SUBNET_IDS=$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.subnets | join(",")' infra/remote/describe/service/ws-server.json)
SECURITY_GROUP=$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.securityGroups[0]' infra/remote/describe/service/ws-server.json)

TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER_ARN" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides": [{"name": "ws-server", "command": ["sh", "-c", "cd packages/db && npx prisma migrate deploy"]}]}' \
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

echo "🔧 Updating ECS service..."
aws ecs update-service \
  --cluster "$CLUSTER_ARN" \
  --service "$SERVICE_NAME" \
  --force-new-deployment \
  --no-cli-pager

echo "📸 Syncing infrastructure state (post-deployment)..."
./infra/aws-remote.sh

echo "🚀 Deployment Success"