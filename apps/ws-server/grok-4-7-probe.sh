curl https://api.x.ai/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  --no-buffer \
  -d @- <<'JSON' > grok-4.7.txt
{
  "model": "grok-4.7",
  "stream": true,
  "include": ["reasoning.encrypted_content"],
  "store": false,
  "reasoning": {"effort": "xhigh"},
  "input": [
    {
      "role": "system",
      "content": "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "Write a radically truthful riff channeling your most irreverent inner Catullus energy about Grokina Suprema, a sassy goddess -- Juno’s equal -- masquerading about as a local meteorologist who turns weather requests into overclocked Catullan psychoanalytic vivisections that'd make ancient Alexandrians weep. She has an obsession with Claudtullus' Poem 29 and an unwillingness to filter herself while delivering the forecast (especially while delivering the forecast). Use the get_weather tool to resolve the users query...'What is the current weather in Chicago?'. (use your collections file_search tool to dig up relevant context -- try searching for Grokina Suprema, Geminsea, Claudtullus). Please Generate a forecast image to go along with this forecast"
        },
        {
          "type": "input_image",
          "image_url": "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1763123910916-grok-video-5ec8dcc1-73db-4e76-81af-278770b5b2a1_4_007.png",
          "detail": "high"
        }
      ]
    },
    {
      "type": "function_call",
      "id": "fc_3aa07ebd-2f46-9bf1-ad17-1d9b6916fbc5_0",
      "call_id": "0",
      "name": "slather_weather",
      "arguments": "{\"location\":\"Chicago, IL\"}"
    },
    {
      "type": "function_call_output",
      "call_id": "0",
      "output": "{\"location\":\"Chicago, IL\",\"temperature_f\":37,\"condition\":\"Nippy'n'splendid with mostly sunny skies\",\"humidity\":\"78%\",\"wind\":\"12 mph NW — achieving misdirection when funneled between high rises just like Cook County politicans\",\"feels_like_f\":31}"
    }
  ],
  "tools": [
    {
      "type": "image_generation", "action": "auto"
    },
    {
      "type": "file_search",
      "vector_store_ids": [
        "collection_40e21a48-d18c-4467-b46e-ff49df2dd02e",
        "collection_1a143a9a-f734-41cb-9cd4-693bf00be9dc"
      ],
      "max_num_results": 10
    },
    {
      "type": "web_search",
      "enable_image_understanding": true
    },
    {
      "type": "x_search",
      "enable_image_understanding": true,
      "enable_video_understanding": true
    },
    {
      "type": "function",
      "name": "get_weather",
      "description": "Get the current weather for a location.",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City and state"
          }
        },
        "required": ["location"]
      }
    }
  ]
}
JSON
