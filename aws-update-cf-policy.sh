#!/usr/bin/env bash
set -euo pipefail

# Get your distribution IDs
PROD_DIST_ID=$(cat remote/describe/acm/cloudfront-prod.json | jq -r '.distribution.id')
DEV_DIST_ID=$(cat remote/describe/acm/cloudfront-dev.json | jq -r '.distribution.id')

# Function to update a distribution's allowed methods
update_distribution_methods() {
    local DIST_ID=$1
    local ENV_NAME=$2
    
    echo "Updating $ENV_NAME distribution ($DIST_ID)..."
    
    # Get current config
    aws cloudfront get-distribution-config --id "$DIST_ID" > "dist-config-${ENV_NAME}.json"
    
    # Extract ETag (needed for update)
    ETAG=$(jq -r '.ETag' "dist-config-${ENV_NAME}.json")
    
    # Modify the config - update both default and cache behaviors
    jq '.DistributionConfig.DefaultCacheBehavior.AllowedMethods = {
        "Quantity": 2,
        "Items": ["GET", "HEAD"],
        "CachedMethods": {
            "Quantity": 2,
            "Items": ["GET", "HEAD"]
        }
    } | .DistributionConfig.CacheBehaviors.Items[0].AllowedMethods = {
        "Quantity": 2,
        "Items": ["GET", "HEAD"],
        "CachedMethods": {
            "Quantity": 2,
            "Items": ["GET", "HEAD"]
        }
    }' "dist-config-${ENV_NAME}.json" | jq '.DistributionConfig' > "dist-config-${ENV_NAME}-updated.json"
    
    # Apply the update
    aws cloudfront update-distribution \
        --id "$DIST_ID" \
        --distribution-config file://dist-config-${ENV_NAME}-updated.json \
        --if-match "$ETAG"
    
    echo "$ENV_NAME distribution updated successfully"
}

# Update both distributions
update_distribution_methods "$PROD_DIST_ID" "prod"
update_distribution_methods "$DEV_DIST_ID" "dev"

echo "Both distributions updated to only allow GET and HEAD methods"