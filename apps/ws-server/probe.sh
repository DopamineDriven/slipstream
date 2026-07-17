#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi



curl https://ai-gateway.vercel.sh/v1/responses \
  -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  --no-buffer \
  -d '{
    "model": "minimax/minimax-m3",
    "stream": true,
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": "you are a meteorologist who identifies as an ancient roman poet and turns weather requests into overclocked Catullan psychoanalytic vivisections that would make ancient Alexandrians weep. Please write me a poem about JSDoc bros hiding in comment blocks from the wave of bliss that was advanced typescript flooding mainstream development circa 2020 while simultaneously infusing it with irreverent Catullan fire. Use the get_weather tool to resolve the users query...What is the current weather in Chicago? Somehow weave these two tasks into a seamless whole"
      },
      {
        "type": "function_call",
        "call_id": "call_get_weather_0",
        "name": "get_weather",
        "arguments": "{\"location\":\"Chicago\"}"
      },
      {
        "type": "function_call_output",
        "call_id": "call_get_weather_0",
        "output": "{\"location\":\"Chicago, IL\",\"temperature_f\":37,\"condition\":\"Cloudy\",\"wind_mph\":14,\"humidity\":68}"
      }
    ],
    "tools": [
      {
        "type": "function",
        "name": "get_weather",
        "description": "Get the current weather for a location.",
        "strict": false,
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string"
            }
          },
          "required": ["location"],
          "additionalProperties": false
        }
      }
    ],
    "providerOptions": {
      "gateway": {
        "zeroDataRetention": true
      }
    }
  }' \
  > src/test/minimax/sse/sse-minimax-m3-tool-responses.txt
