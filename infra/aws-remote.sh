#!/usr/bin/env bash
set -euo pipefail

mkdir -p infra/remote/describe/{cluster,service,taskdef,tg,lb,listeners,repository,image,sg,subnets}

REGION=us-east-1

REPO_ARNS=$(
  aws ecr describe-repositories --region "$REGION" |
    jq -r '.repositories[].repositoryArn'
)

for REPO_ARN in $REPO_ARNS; do
  REPO=${REPO_ARN##*/}
  echo "→ Describing ECR repo $REPO"

  aws ecr describe-repositories \
    --repository-names "$REPO" \
    --region "$REGION" \
    >infra/remote/describe/repository/"$REPO".json

  aws ecr describe-images \
    --repository-name "$REPO" \
    --region "$REGION" \
    >infra/remote/describe/image/"$REPO".json
done

CLUSTER_ARNS=$(aws ecs list-clusters \
  --region "$REGION" |
  jq -r '.clusterArns[]')
for CLUSTER_ARN in $CLUSTER_ARNS; do
  CLUSTER_NAME=${CLUSTER_ARN##*/}
  echo "→ Using cluster: $CLUSTER_ARN"

  aws ecs describe-clusters \
    --clusters "$CLUSTER_ARN" \
    --region "$REGION" \
    >infra/remote/describe/cluster/"$CLUSTER_NAME".json

  SERVICE_ARNS=$(aws ecs list-services \
    --cluster "$CLUSTER_ARN" \
    --region "$REGION" |
    jq -r '.serviceArns[]')

  for ARN in $SERVICE_ARNS; do

    NAME=${ARN##*/}
    echo "→ Describing service $NAME ($ARN)"

    aws ecs describe-services \
      --cluster "$CLUSTER_ARN" \
      --services "$NAME" \
      --region "$REGION" \
      >infra/remote/describe/service/"$NAME".json

    TASK_DEF_ARN=$(jq -r '.services[0].taskDefinition' infra/remote/describe/service/"$NAME".json)
    aws ecs describe-task-definition \
      --task-definition "$TASK_DEF_ARN" \
      --region us-east-1 >infra/remote/describe/taskdef/"$NAME".json

    TG_ARN=$(jq -r '.services[0].loadBalancers[0].targetGroupArn' infra/remote/describe/service/"$NAME".json)
    aws elbv2 describe-target-groups \
      --target-group-arns "$TG_ARN" \
      --region us-east-1 >infra/remote/describe/tg/"$NAME".json

    LB_ARN=$(jq -r '.TargetGroups[0].LoadBalancerArns[0]' infra/remote/describe/tg/"$NAME".json)

    aws elbv2 describe-load-balancers \
      --load-balancer-arns "$LB_ARN" \
      --region us-east-1 >infra/remote/describe/lb/"$NAME".json

    aws elbv2 describe-listeners \
      --load-balancer-arn "$LB_ARN" \
      --region us-east-1 >infra/remote/describe/listeners/"$NAME".json

    SECURITY_GROUP=$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.securityGroups | join(" ")' infra/remote/describe/service/"$NAME".json)

    aws ec2 describe-security-groups \
      --group-ids "$SECURITY_GROUP" \
      --region "$REGION" >infra/remote/describe/sg/"$NAME".json

    SUBNET_IDS=$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.subnets[]' infra/remote/describe/service/"$NAME".json)

    for SUBNET_ID in $SUBNET_IDS; do
      mkdir -p infra/remote/describe/subnets/"$NAME"

      aws ec2 describe-subnets \
        --subnet-ids "$SUBNET_ID" \
        >infra/remote/describe/subnets/"$NAME"/"$SUBNET_ID".json
    done
  done
done
