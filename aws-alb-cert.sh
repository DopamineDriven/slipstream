#!/usr/bin/env bash
set -euo pipefail

CERT_ARN=$(cat remote/describe/acm/wildcard-aicoalesce-arn.txt)
REGION=us-east-1

# Find your ALB by tag or name pattern
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --region "$REGION" \
  --query "LoadBalancers[?contains(LoadBalancerName, 'ws-alb')].LoadBalancerArn" \
  --output text)

echo "Found ALB: $ALB_ARN"

# Get HTTPS listener
LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --region "$REGION" \
  --query "Listeners[?Port==\`443\`].ListenerArn" \
  --output text)

# Add new certificate
aws elbv2 add-listener-certificates \
  --listener-arn "$LISTENER_ARN" \
  --certificates CertificateArn="$CERT_ARN" \
  --region "$REGION" \
  --output json > remote/describe/alb/aicoalesce-cert-added.json

echo "✓ Certificate attached to ALB for ws.aicoalesce.com and py.aicoalesce.com"