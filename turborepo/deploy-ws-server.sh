#!/usr/bin/env bash
set -euo pipefail

docker build \
  -t t3-chat-clone-ws-server \
  -f Dockerfile \
  .

docker tag \
  t3-chat-clone-ws-server:latest \
  782904577755.dkr.ecr.us-east-1.amazonaws.com/t3-chat-clone-ws-server:latest

docker push \
  782904577755.dkr.ecr.us-east-1.amazonaws.com/t3-chat-clone-ws-server:latest

echo "ws-server deployment success 🚀"
 