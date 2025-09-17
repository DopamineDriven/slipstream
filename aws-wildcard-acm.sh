#!/usr/bin/env bash
set -euo pipefail

REGION=us-east-1
DOMAIN=aicoalesce.com
HOSTED_ZONE_ID=Z09628042UFMOYJLZZSTY
ACCOUNT_ID=782904577755

# Request wildcard cert
echo "Requesting wildcard certificate for *.$DOMAIN..."
CERT_ARN=$(aws acm request-certificate \
  --domain-name "*.$DOMAIN" \
  --subject-alternative-names "$DOMAIN" \
  --validation-method DNS \
  --region "$REGION" \
  --output json | jq -r '.CertificateArn')

echo "Certificate ARN: $CERT_ARN"
echo "$CERT_ARN" > remote/describe/acm/wildcard-aicoalesce-arn.txt

# Wait for cert to be ready
sleep 5

# Get validation details
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$REGION" \
  --output json > remote/describe/acm/wildcard-aicoalesce-validation.json

# Extract validation CNAME
VALIDATION=$(jq -r '.Certificate.DomainValidationOptions[0].ResourceRecord' remote/describe/acm/wildcard-aicoalesce-validation.json)
RECORD_NAME=$(echo $VALIDATION | jq -r '.Name')
RECORD_VALUE=$(echo $VALIDATION | jq -r '.Value')

# Create Route 53 validation record
echo "Creating validation record in Route 53..."
aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"$RECORD_NAME\",
        \"Type\": \"CNAME\",
        \"TTL\": 300,
        \"ResourceRecords\": [{\"Value\": \"$RECORD_VALUE\"}]
      }
    }]
  }" > remote/describe/route53/validation-created.json

echo "Waiting for certificate validation..."
aws acm wait certificate-validated \
  --certificate-arn "$CERT_ARN" \
  --region "$REGION" && echo "✓ Certificate validated!"