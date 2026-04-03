#!/usr/bin/env bash
set -euo pipefail

: "${REGION:=us-east-1}"
: "${TASK_ROLE_NAME:=wsServerTaskRole}"
: "${ASSETS_BUCKET:=ws-server-assets-prod}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

read -r -d '' TRUST_DOC <<JSON || true
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "${ACCOUNT_ID}" },
        "ArnLike":      { "aws:SourceArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:*" }
      }
    }
  ]
}
JSON

if aws iam get-role --role-name "$TASK_ROLE_NAME" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$TASK_ROLE_NAME" --policy-document "$TRUST_DOC" >/dev/null
else
  aws iam create-role --role-name "$TASK_ROLE_NAME" --assume-role-policy-document "$TRUST_DOC" \
    --description "Task role for ws-server (app -> S3/KMS/etc)" >/dev/null
fi

read -r -d '' POLICY_DOC <<JSON || true
{
  "Version":"2012-10-17",
  "Statement":[
    {
      "Sid":"ListBucketScoped",
      "Effect":"Allow",
      "Action":["s3:ListBucket","s3:ListBucketMultipartUploads"],
      "Resource":"arn:aws:s3:::${ASSETS_BUCKET}",
      "Condition":{"StringLike":{"s3:prefix":["u/*","public/*","*"]}}
    },
    {
      "Sid":"ObjectRW",
      "Effect":"Allow",
      "Action":[
        "s3:GetObject","s3:PutObject","s3:DeleteObject",
        "s3:AbortMultipartUpload","s3:ListMultipartUploadParts",
        "s3:PutObjectTagging","s3:GetObjectTagging","s3:HeadObject"
      ],
      "Resource":"arn:aws:s3:::${ASSETS_BUCKET}/*"
    }
  ]
}
JSON

aws iam put-role-policy \
  --role-name "$TASK_ROLE_NAME" \
  --policy-name "S3Access-${ASSETS_BUCKET}" \
  --policy-document "$POLICY_DOC" >/dev/null

echo "✓ Role ensured: $TASK_ROLE_NAME → $(aws iam get-role --role-name "$TASK_ROLE_NAME" --query 'Role.Arn' --output text)"
echo "Heads-up: IAM is eventually consistent; give it ~10–60s before you expect the new role/policy to work everywhere."
