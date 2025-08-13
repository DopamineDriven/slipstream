#!/usr/bin/env bash
set -euo pipefail

ACCOUNT_ID="782904577755"
REGION="us-east-1"

ROLE_NAME="pyGenTaskRole"
POLICY_NAME="pyGenTaskRoleInline"
SECRET_ARN="arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:t3-chat-clone-ws-server-credentials-24IAt4"

DEV_BUCKET="gen-assets-dev"
PROD_BUCKET="gen-assets-prod"
PREFIX="generated-images/*"

ASSUME_ROLE_DOC='{
  "Version":"2012-10-17",
  "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
}'

if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$ASSUME_ROLE_DOC" >/dev/null
  echo "✓ Role created: $ROLE_NAME"
else
  echo "✓ Role exists: $ROLE_NAME"
fi

POLICY_DOC=$(jq -n \
  --arg region "$REGION" \
  --arg dev "arn:aws:s3:::${DEV_BUCKET}" \
  --arg prod "arn:aws:s3:::${PROD_BUCKET}" \
  --arg devobj "arn:aws:s3:::${DEV_BUCKET}/${PREFIX}" \
  --arg prodobj "arn:aws:s3:::${PROD_BUCKET}/${PREFIX}" \
  --arg secret "$SECRET_ARN" \
  --arg pref   "$PREFIX" '
{
  "Version":"2012-10-17",
  "Statement":[
    {
      "Sid":"ListBucketPrefixes",
      "Effect":"Allow",
      "Action":["s3:ListBucket"],
      "Resource":[ $dev, $prod ],
      "Condition":{ "StringLike": { "s3:prefix": [ $pref ] } }
    },
    {
      "Sid":"WriteObjects",
      "Effect":"Allow",
      "Action":[
        "s3:PutObject","s3:PutObjectTagging",
        "s3:AbortMultipartUpload","s3:ListMultipartUploadParts"
      ],
      "Resource":[ $devobj, $prodobj ]
    },
    {
      "Sid":"ReadBackForPostproc",
      "Effect":"Allow",
      "Action":[ "s3:GetObject","s3:HeadObject" ],
      "Resource":[ $devobj, $prodobj ]
    },
    {
      "Sid":"ReadSecretForCfg",
      "Effect":"Allow",
      "Action":[ "secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret" ],
      "Resource": $secret
    }
  ]
}')

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$POLICY_DOC" >/dev/null
echo "✓ Inline policy ensured on role: $POLICY_NAME"

aws iam get-role --role-name "$ROLE_NAME" --query "Role.Arn" --output text
