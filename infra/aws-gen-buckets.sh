#!/usr/bin/env bash
set -euo pipefail

ROLE_NAME="${ROLE_NAME:-genServiceTaskRole}"

POLICY_NAME="${POLICY_NAME:-S3GenAssetsAccess}"

BUCKETS_CSV="${BUCKETS:-gen-assets-dev,gen-assets-prod}"

KEY_PREFIX="${KEY_PREFIX:-generated-images/*}"

KMS_KEY_ARN="${KMS_KEY_ARN:-}"

readarray -td, BUCKETS_ARR < <(printf '%s' "$BUCKETS_CSV"); BUCKETS_ARR+=("")

echo "Ensuring IAM role: $ROLE_NAME"

TRUST_JSON="$(cat <<'JSON'
{
  "Version":"2012-10-17",
  "Statement":[
    {
      "Effect":"Allow",
      "Principal":{"Service":"ecs-tasks.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }
  ]
}
JSON
)"

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$TRUST_JSON" >/dev/null
  echo "✓ Role exists; trust policy updated (if needed)."
else
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_JSON" \
    --description "Task role for image-generation microservice (Fargate)" >/dev/null
  echo "✓ Role created."
fi

BUCKET_ARNS_JSON="$(printf '%s\n' "${BUCKETS_ARR[@]}" | sed '/^$/d' | awk '{print "arn:aws:s3:::"$1} ' | jq -Rsc 'split("\n")|map(select(length>0))')"

OBJ_ARNS_JSON="$(printf '%s\n' "${BUCKETS_ARR[@]}" | sed '/^$/d' | awk -v p="$KEY_PREFIX" '{print "arn:aws:s3:::"$1"/"p} ' | jq -Rsc 'split("\n")|map(select(length>0))')"

POLICY_JSON="$(jq -n \
  --argjson bucketArns "$BUCKET_ARNS_JSON" \
  --argjson objArns "$OBJ_ARNS_JSON" \
  --arg prefix "$KEY_PREFIX" \
  '{
     Version:"2012-10-17",
     Statement:[
       {
         Sid:"ListBucketPrefixes",
         Effect:"Allow",
         Action:["s3:ListBucket"],
         Resource: $bucketArns,
         Condition:{StringLike:{"s3:prefix":[$prefix]}}
       },
       {
         Sid:"WriteObjects",
         Effect:"Allow",
         Action:["s3:PutObject","s3:PutObjectTagging","s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],
         Resource: $objArns
       },
       {
         Sid:"ReadBackForPostproc",
         Effect:"Allow",
         Action:["s3:GetObject","s3:HeadObject"],
         Resource: $objArns
       }
     ]
   }')"

if [[ -n "$KMS_KEY_ARN" ]]; then
  POLICY_JSON="$(jq --arg key "$KMS_KEY_ARN" '.Statement += [{
      Sid:"KmsForS3",
      Effect:"Allow",
      Action:["kms:GenerateDataKey*","kms:Decrypt","kms:DescribeKey"],
      Resource:$key
    }]' <<<"$POLICY_JSON")"
  echo "→ Including KMS permissions for $KMS_KEY_ARN"
fi

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$POLICY_JSON" >/dev/null
echo "✓ Inline policy $POLICY_NAME applied."

ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)"
echo "Task Role ARN: $ROLE_ARN"
