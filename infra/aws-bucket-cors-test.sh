#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing Adobe PDF Services S3 Access${NC}"
echo "========================================"
echo ""

# Test bucket (change if needed)
BUCKET=${1:-"ws-server-assets-dev"}
echo -e "${BLUE}Testing bucket: ${YELLOW}${BUCKET}${NC}"

# Create a test file
TEST_FILE="adobe-cors-test-$(date +%s).txt"
TEST_KEY="test/${TEST_FILE}"
echo "This is a CORS test file for Adobe PDF Services" > /tmp/${TEST_FILE}

echo -e "${BLUE}1. Uploading test file to S3...${NC}"
if aws s3 cp /tmp/${TEST_FILE} s3://${BUCKET}/${TEST_KEY} 2>/dev/null; then
  echo -e "   ${GREEN}✅ Test file uploaded${NC}"
else
  echo -e "   ${RED}❌ Failed to upload test file${NC}"
  exit 1
fi

echo -e "${BLUE}2. Checking CORS configuration...${NC}"
CORS_CONFIG=$(aws s3api get-bucket-cors --bucket "${BUCKET}" 2>/dev/null || echo "{}")

if echo "$CORS_CONFIG" | grep -q "pdf-services.adobe.io"; then
  echo -e "   ${GREEN}✅ Adobe domains found in CORS${NC}"
else
  echo -e "   ${RED}❌ Adobe domains NOT in CORS config${NC}"
  echo -e "   ${YELLOW}Run the CORS update script first!${NC}"
fi

echo -e "${BLUE}3. Generating presigned URL...${NC}"
PRESIGNED_URL=$(aws s3 presign s3://${BUCKET}/${TEST_KEY} --expires-in 3600 2>/dev/null)
if [ -n "$PRESIGNED_URL" ]; then
  echo -e "   ${GREEN}✅ Presigned URL generated${NC}"
else
  echo -e "   ${RED}❌ Failed to generate presigned URL${NC}"
  exit 1
fi

echo -e "${BLUE}4. Testing access with Adobe Origin header...${NC}"
# Test with curl using Adobe's origin
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Origin: https://pdf-services.adobe.io" -I "${PRESIGNED_URL}")

if [ "$RESPONSE" = "200" ]; then
  echo -e "   ${GREEN}✅ Adobe can access your S3 files! (HTTP ${RESPONSE})${NC}"
  CORS_OK=true
else
  echo -e "   ${RED}❌ Adobe cannot access files (HTTP ${RESPONSE})${NC}"
  CORS_OK=false
fi

echo -e "${BLUE}5. Testing CORS headers in response...${NC}"
HEADERS=$(curl -sI -H "Origin: https://pdf-services.adobe.io" "${PRESIGNED_URL}" 2>/dev/null)

if echo "$HEADERS" | grep -qi "access-control-allow-origin"; then
  CORS_HEADER=$(echo "$HEADERS" | grep -i "access-control-allow-origin" | head -1)
  echo -e "   ${GREEN}✅ CORS header present: ${CORS_HEADER}${NC}"
else
  echo -e "   ${YELLOW}⚠️  No CORS headers in response${NC}"
fi

echo -e "${BLUE}6. Cleaning up test file...${NC}"
if aws s3 rm s3://${BUCKET}/${TEST_KEY} 2>/dev/null; then
  echo -e "   ${GREEN}✅ Test file removed${NC}"
fi
rm -f /tmp/${TEST_FILE}

echo ""
echo "========================================"
if [ "$CORS_OK" = true ]; then
  echo -e "${GREEN}🎉 SUCCESS! Adobe PDF Services can access your S3 bucket.${NC}"
  echo -e "${GREEN}Your PDF conversions should work now!${NC}"
else
  echo -e "${RED}❌ FAILURE: Adobe cannot access your S3 bucket.${NC}"
  echo -e "${YELLOW}Please run the CORS update script to fix this.${NC}"
fi
echo ""

# Show current Adobe origins in CORS
echo -e "${BLUE}Current Adobe origins in CORS config:${NC}"
echo "$CORS_CONFIG" | jq -r '.CORSRules[0].AllowedOrigins[]' 2>/dev/null | grep adobe | while read -r domain; do
  echo -e "  ${GREEN}•${NC} $domain"
done || echo -e "  ${RED}None found${NC}"