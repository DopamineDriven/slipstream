#!/usr/bin/env bash
set -euo pipefail

CERT_ARN=$(cat remote/describe/acm/wildcard-aicoalesce-arn.txt)
REGION=us-east-1

update_distribution() {
    local DIST_ID=$1
    local OLD_DOMAIN=$2
    local NEW_DOMAIN=$3
    local ENV=$4
    
    echo "Updating $ENV distribution $DIST_ID: $OLD_DOMAIN → $NEW_DOMAIN"
    
    # Get current config
    aws cloudfront get-distribution-config --id "$DIST_ID" \
      --output json > remote/describe/cloudfront/${ENV}-current.json
    
    ETAG=$(jq -r '.ETag' remote/describe/cloudfront/${ENV}-current.json)
    
    # Create updated config
    jq --arg cert "$CERT_ARN" --arg new_domain "$NEW_DOMAIN" --arg old_domain "$OLD_DOMAIN" '
      .DistributionConfig.Aliases.Items = (
        .DistributionConfig.Aliases.Items | 
        map(if . == $old_domain then $new_domain else . end) |
        unique
      ) |
      .DistributionConfig.Aliases.Quantity = (.DistributionConfig.Aliases.Items | length) |
      .DistributionConfig.ViewerCertificate = {
        "ACMCertificateArn": $cert,
        "SSLSupportMethod": "sni-only",
        "MinimumProtocolVersion": "TLSv1.2_2021",
        "Certificate": $cert,
        "CertificateSource": "acm"
      }' remote/describe/cloudfront/${ENV}-current.json \
      | jq '.DistributionConfig' > remote/describe/cloudfront/${ENV}-updated.json
    
    # Apply update
    aws cloudfront update-distribution \
      --id "$DIST_ID" \
      --distribution-config file://remote/describe/cloudfront/${ENV}-updated.json \
      --if-match "$ETAG" \
      --output json > remote/describe/cloudfront/${ENV}-result.json
    
    echo "✓ Updated $NEW_DOMAIN"
    
    # Save new config for your records
    cat > remote/describe/cloudfront/${ENV}-aicoalesce-config.json <<EOF
{
  "environment": "$ENV",
  "subdomain": "$NEW_DOMAIN",
  "distribution": {
    "id": "$DIST_ID",
    "arn": "arn:aws:cloudfront::782904577755:distribution/$DIST_ID",
    "domain": "$(jq -r '.DistributionConfig.DomainName' remote/describe/cloudfront/${ENV}-current.json)"
  },
  "certificate_arn": "$CERT_ARN",
  "previous_domain": "$OLD_DOMAIN"
}
EOF
}

# Update both distributions with correct IDs
update_distribution "E3TADWV7HSBMUA" "assets.d0paminedriven.com" "assets.aicoalesce.com" "production"
update_distribution "E2SSLG5XR4J13X" "assets-dev.d0paminedriven.com" "assets-dev.aicoalesce.com" "development"

echo "✓ Both CloudFront distributions updated"
echo "Note: CloudFront propagation takes 15-30 minutes"