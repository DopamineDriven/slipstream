#!/usr/bin/env bash
set -euo pipefail

HOSTED_ZONE_ID=Z09628042UFMOYJLZZSTY

# Add Route 53 alias records for CloudFront
aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch '{
    "Changes": [
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "assets.aicoalesce.com",
          "Type": "A",
          "AliasTarget": {
            "HostedZoneId": "Z2FDTNDATAQYW2",
            "DNSName": "d2ez05n9xgquv0.cloudfront.net",
            "EvaluateTargetHealth": false
          }
        }
      },
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "assets-dev.aicoalesce.com",
          "Type": "A",
          "AliasTarget": {
            "HostedZoneId": "Z2FDTNDATAQYW2",
            "DNSName": "d3crpej41tcuad.cloudfront.net",
            "EvaluateTargetHealth": false
          }
        }
      }
    ]
  }' > remote/describe/route53/cloudfront-aliases-created.json

echo "✓ Route 53 alias records created for CloudFront distributions"