#!/usr/bin/env bash
set -euo pipefail

REGION=us-east-1
DOMAIN="d0paminedriven.com"

# Your existing certificate ARNs
CERT_ARN_PROD="arn:aws:acm:us-east-1:782904577755:certificate/14ae6dfd-aeae-42c5-aac3-87541bc0fcca"
CERT_ARN_DEV="arn:aws:acm:us-east-1:782904577755:certificate/d35fda3c-57ef-4dfc-91bd-6da99cc34c02"

# Define bucket mappings
declare -A DEV_BUCKETS=(
    ["upload"]="ws-server-assets-dev"
    ["generated"]="py-gen-assets-dev"
)

declare -A PROD_BUCKETS=(
    ["upload"]="ws-server-assets-prod"
    ["generated"]="py-gen-assets-prod"
)

# Use your existing OAC IDs from Step 3
echo "ws-server-assets-dev" > "oac-ws-server-assets-dev.txt" && echo "E1GNYMV79MQ3KS" > "oac-ws-server-assets-dev.txt"
echo "py-gen-assets-dev" > "oac-py-gen-assets-dev.txt" && echo "EJSAAPGQ9U9FS" > "oac-py-gen-assets-dev.txt"
echo "ws-server-assets-prod" > "oac-ws-server-assets-prod.txt" && echo "E77UWHQDD8CFH" > "oac-ws-server-assets-prod.txt"
echo "py-gen-assets-prod" > "oac-py-gen-assets-prod.txt" && echo "E1JW8URCO75ZVW" > "oac-py-gen-assets-prod.txt"

# Step 4: Create CloudFront distributions
echo "Step 4: Creating CloudFront distributions..."

create_distribution() {
    local ENV=$1
    local SUBDOMAIN=$2
    local CERT_ARN=$3
    
    echo "Creating distribution for $ENV environment..."
    
    # Get the right bucket set
    if [ "$ENV" == "dev" ]; then
        local UPLOAD_BUCKET="${DEV_BUCKETS[upload]}"
        local GENERATED_BUCKET="${DEV_BUCKETS[generated]}"
    else
        local UPLOAD_BUCKET="${PROD_BUCKETS[upload]}"
        local GENERATED_BUCKET="${PROD_BUCKETS[generated]}"
    fi
    
    local OAC_UPLOAD=$(cat "oac-${UPLOAD_BUCKET}.txt")
    local OAC_GENERATED=$(cat "oac-${GENERATED_BUCKET}.txt")
    
    # Create cache behavior with only allowed headers for CORS
    CACHE_BEHAVIOR='{
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 7,
            "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
            "CachedMethods": {
                "Quantity": 3,
                "Items": ["GET", "HEAD", "OPTIONS"]
            }
        },
        "TrustedSigners": {
            "Enabled": false,
            "Quantity": 0
        },
        "ForwardedValues": {
            "QueryString": false,
            "Cookies": {"Forward": "none"},
            "Headers": {
                "Quantity": 3,
                "Items": [
                    "Origin",
                    "Access-Control-Request-Method",
                    "Access-Control-Request-Headers"
                ]
            }
        },
        "MinTTL": 0,
        "DefaultTTL": 86400,
        "MaxTTL": 31536000,
        "Compress": true
    }'
    
    # Create the distribution with both origins
    DIST_OUTPUT=$(aws cloudfront create-distribution \
        --distribution-config "{
            \"CallerReference\": \"${ENV}-$(date +%s)\",
            \"Aliases\": {
                \"Quantity\": 1,
                \"Items\": [\"${SUBDOMAIN}.${DOMAIN}\"]
            },
            \"Origins\": {
                \"Quantity\": 2,
                \"Items\": [
                    {
                        \"Id\": \"S3-${UPLOAD_BUCKET}\",
                        \"DomainName\": \"${UPLOAD_BUCKET}.s3.us-east-1.amazonaws.com\",
                        \"S3OriginConfig\": {
                            \"OriginAccessIdentity\": \"\"
                        },
                        \"OriginAccessControlId\": \"${OAC_UPLOAD}\"
                    },
                    {
                        \"Id\": \"S3-${GENERATED_BUCKET}\",
                        \"DomainName\": \"${GENERATED_BUCKET}.s3.us-east-1.amazonaws.com\",
                        \"S3OriginConfig\": {
                            \"OriginAccessIdentity\": \"\"
                        },
                        \"OriginAccessControlId\": \"${OAC_GENERATED}\"
                    }
                ]
            },
            \"DefaultCacheBehavior\": $(echo $CACHE_BEHAVIOR | jq ". + {\"TargetOriginId\": \"S3-${UPLOAD_BUCKET}\"}"),
            \"CacheBehaviors\": {
                \"Quantity\": 1,
                \"Items\": [$(echo $CACHE_BEHAVIOR | jq ". + {\"PathPattern\": \"/generated/*\", \"TargetOriginId\": \"S3-${GENERATED_BUCKET}\"}")
                ]
            },
            \"Comment\": \"CDN for ${ENV} environment assets with CORS support\",
            \"Enabled\": true,
            \"ViewerCertificate\": {
                \"ACMCertificateArn\": \"${CERT_ARN}\",
                \"SSLSupportMethod\": \"sni-only\",
                \"MinimumProtocolVersion\": \"TLSv1.2_2021\"
            }
        }")
    
    DIST_ID=$(echo "$DIST_OUTPUT" | jq -r '.Distribution.Id')
    DIST_ARN=$(echo "$DIST_OUTPUT" | jq -r '.Distribution.ARN')  
    DIST_DOMAIN=$(echo "$DIST_OUTPUT" | jq -r '.Distribution.DomainName')
    
    echo "Distribution created for $ENV:"
    echo "  ID: $DIST_ID"
    echo "  Domain: $DIST_DOMAIN"
    echo "  ARN: $DIST_ARN"
    
    # Save for bucket policies
    echo "$DIST_ARN" > "dist-arn-${ENV}.txt"
    echo "$DIST_DOMAIN" > "dist-domain-${ENV}.txt"
}

# Create both distributions
create_distribution "prod" "assets" "$CERT_ARN_PROD"
create_distribution "dev" "assets-dev" "$CERT_ARN_DEV"

# Continue with steps 5-7...

# Step 5: Update all bucket policies
echo -e "\nStep 5: Updating S3 bucket policies..."

update_bucket_policy() {
    local BUCKET=$1
    local ENV=$2
    local DIST_ARN=$(cat "dist-arn-${ENV}.txt")
    
    echo "Updating policy for $BUCKET..."
    
    cat > "bucket-policy-${BUCKET}.json" <<EOF
{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "AllowCloudFrontServicePrincipal",
        "Effect": "Allow",
        "Principal": {
            "Service": "cloudfront.amazonaws.com"
        },
        "Action": [
            "s3:GetObject",
            "s3:GetObjectVersion"
        ],
        "Resource": "arn:aws:s3:::${BUCKET}/*",
        "Condition": {
            "StringEquals": {
                "AWS:SourceArn": "${DIST_ARN}"
            }
        }
    }]
}
EOF
    
    aws s3api put-bucket-policy \
        --bucket "$BUCKET" \
        --policy file://bucket-policy-${BUCKET}.json
}

# Update dev bucket policies
for BUCKET in "${DEV_BUCKETS[@]}"; do
    update_bucket_policy "$BUCKET" "dev"
done

# Update prod bucket policies  
for BUCKET in "${PROD_BUCKETS[@]}"; do
    update_bucket_policy "$BUCKET" "prod"
done

# Step 6: Optional - Update CORS to include CloudFront domains
echo -e "\nStep 6: Do you want to update CORS policies to include CloudFront domains? (y/n)"
read -r UPDATE_CORS

if [[ "$UPDATE_CORS" == "y" ]]; then
    for BUCKET in "${DEV_BUCKETS[@]}" "${PROD_BUCKETS[@]}"; do
        echo "Updating CORS for $BUCKET..."
        cat > "cors-${BUCKET}.json" <<EOF
{
    "CORSRules": [
        {
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["GET", "HEAD", "PUT", "POST", "DELETE"],
            "AllowedOrigins": [
                "http://localhost:3030",
                "https://chat.d0paminedriven.com",
                "https://dev.chat.d0paminedriven.com",
                "https://stg.chat.d0paminedriven.com",
                "https://py.d0paminedriven.com",
                "http://localhost:8000",
                "https://assets.d0paminedriven.com",
                "https://assets-dev.d0paminedriven.com"
            ],
            "ExposeHeaders": [
                "ETag",
                "x-amz-request-id",
                "x-amz-version-id",
                "x-amz-checksum-type",
                "x-amz-checksum-crc32",
                "x-amz-checksum-crc32c",
                "x-amz-checksum-crc64nvme",
                "x-amz-checksum-sha1",
                "x-amz-checksum-sha256",
                "Content-Range",
                "Accept-Ranges",
                "Content-Length",
                "Content-Type",
                "Last-Modified",
                "Content-Encoding",
                "Cache-Control"
            ],
            "MaxAgeSeconds": 3000
        }
    ]
}
EOF
        aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration file://cors-${BUCKET}.json
    done
fi

# Step 7: Save distribution info and output DNS records
echo -e "\nStep 7: Saving distribution information..."

# Ensure directory exists
mkdir -p remote/describe/acm

# Save production distribution info
PROD_DIST_DOMAIN=$(cat dist-domain-prod.txt)
PROD_DIST_ARN=$(cat dist-arn-prod.txt)
PROD_DIST_ID=$(echo "$PROD_DIST_ARN" | cut -d'/' -f2)

cat > remote/describe/acm/cloudfront-prod.json <<EOF
{
  "environment": "production",
  "subdomain": "assets.d0paminedriven.com",
  "distribution": {
    "id": "$PROD_DIST_ID",
    "arn": "$PROD_DIST_ARN",
    "domain": "$PROD_DIST_DOMAIN"
  },
  "certificate_arn": "$CERT_ARN_PROD",
  "buckets": {
    "upload": "ws-server-assets-prod",
    "generated": "py-gen-assets-prod"
  },
  "dns_record": {
    "type": "CNAME",
    "name": "assets.d0paminedriven.com",
    "value": "$PROD_DIST_DOMAIN"
  },
  "urls": {
    "user_uploads": "https://assets.d0paminedriven.com/upload/*",
    "ai_generated": "https://assets.d0paminedriven.com/generated/*"
  }
}
EOF

# Save dev distribution info
DEV_DIST_DOMAIN=$(cat dist-domain-dev.txt)
DEV_DIST_ARN=$(cat dist-arn-dev.txt)
DEV_DIST_ID=$(echo "$DEV_DIST_ARN" | cut -d'/' -f2)

cat > remote/describe/acm/cloudfront-dev.json <<EOF
{
  "environment": "development",
  "subdomain": "assets-dev.d0paminedriven.com",
  "distribution": {
    "id": "$DEV_DIST_ID",
    "arn": "$DEV_DIST_ARN",
    "domain": "$DEV_DIST_DOMAIN"
  },
  "certificate_arn": "$CERT_ARN_DEV",
  "buckets": {
    "upload": "ws-server-assets-dev",
    "generated": "py-gen-assets-dev"
  },
  "dns_record": {
    "type": "CNAME",
    "name": "assets-dev.d0paminedriven.com",
    "value": "$DEV_DIST_DOMAIN"
  },
  "urls": {
    "user_uploads": "https://assets-dev.d0paminedriven.com/upload/*",
    "ai_generated": "https://assets-dev.d0paminedriven.com/generated/*"
  }
}
EOF

# Save combined summary
cat > remote/describe/acm/cloudfront-summary.json <<EOF
{
  "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "distributions": {
    "production": {
      "id": "$PROD_DIST_ID",
      "domain": "$PROD_DIST_DOMAIN",
      "custom_domain": "assets.d0paminedriven.com"
    },
    "development": {
      "id": "$DEV_DIST_ID",
      "domain": "$DEV_DIST_DOMAIN",
      "custom_domain": "assets-dev.d0paminedriven.com"
    }
  },
  "dns_records_to_add": [
    "assets-dev.d0paminedriven.com CNAME $DEV_DIST_DOMAIN",
    "assets.d0paminedriven.com CNAME $PROD_DIST_DOMAIN"
  ]
}
EOF

echo "Distribution info saved to remote/describe/acm/"
echo ""
echo "==================================="
echo "CNAME records for DNS:"
echo "==================================="
cat remote/describe/acm/cloudfront-summary.json | jq -r '.dns_records_to_add[]'