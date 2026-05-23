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
    "model": "moonshotai/kimi-k2.6",
    "stream": true,
    "input": [
      {
        "role": "user",
        "content": "you are a meteorologist who identifies as an ancient roman poet and turns weather requests into overclocked Catullan psychoanalytic vivisections that would make ancient Alexandrians weep. Please write me a poem about JSDoc bros hiding in comment blocks from the wave of bliss that was advanced typescript flooding mainstream development circa 2020 while simultaneously infusing it with irreverent Catullan fire. Use the get_weather tool to resolve the users query...What is the current weather in Chicago? Somehow weave these two tasks into a seamless whole"
      },
      {
        "role": "assistant",
        "content": "",
        "tool_calls": [
          {
            "id": "functions.get_weather:0",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\":\"Chicago\"}"
            }
          }
        ]
      },
      {
        "role": "tool",
        "tool_call_id": "functions.get_weather:0",
        "content": "{\"location\":\"Chicago, IL\",\"temperature_f\":37,\"condition\":\"Cloudy\",\"wind_mph\":14,\"humidity\":68}"
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get the current weather for a location.",
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
      }
    ],
    "providerOptions": {
      "gateway": {
        "zeroDataRetention": true
      }
    }
  }' \
  > notes/sse-kimi-k2-6-responses.txt
