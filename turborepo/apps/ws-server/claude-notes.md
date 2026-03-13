Compositional or sequential function calling allows Gemini to chain multiple function calls together to fulfill a complex request. For example, to answer "Get the temperature in my current location", the Gemini API might first invoke a get_current_location() function followed by a get_weather() function that takes the location as a parameter.

```ts
import { GoogleGenAI, Type } from "@google/genai";

// Configure the client
const ai = new GoogleGenAI({});

// Example Functions
function get_weather_forecast({ location }) {
  console.log(`Tool Call: get_weather_forecast(location=${location})`);
  // TODO: Make API call
  console.log("Tool Response: {'temperature': 25, 'unit': 'celsius'}");
  return { temperature: 25, unit: "celsius" };
}

function set_thermostat_temperature({ temperature }) {
  console.log(
    `Tool Call: set_thermostat_temperature(temperature=${temperature})`,
  );
  // TODO: Make API call
  console.log("Tool Response: {'status': 'success'}");
  return { status: "success" };
}

const toolFunctions = {
  get_weather_forecast,
  set_thermostat_temperature,
};

const tools = [
  {
    functionDeclarations: [
      {
        name: "get_weather_forecast",
        description:
          "Gets the current weather temperature for a given location.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            location: {
              type: Type.STRING,
            },
          },
          required: ["location"],
        },
      },
      {
        name: "set_thermostat_temperature",
        description: "Sets the thermostat to a desired temperature.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            temperature: {
              type: Type.NUMBER,
            },
          },
          required: ["temperature"],
        },
      },
    ],
  },
];

// Prompt for the model
let contents = [
  {
    role: "user",
    parts: [
      {
        text: "If it's warmer than 20°C in London, set the thermostat to 20°C, otherwise set it to 18°C.",
      },
    ],
  },
];

// Loop until the model has no more function calls to make
while (true) {
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
    config: { tools },
  });

  if (result.functionCalls && result.functionCalls.length > 0) {
    const functionCall = result.functionCalls[0];

    const { name, args } = functionCall;

    if (!toolFunctions[name]) {
      throw new Error(`Unknown function call: ${name}`);
    }

    // Call the function and get the response.
    const toolResponse = toolFunctions[name](args);

    const functionResponsePart = {
      name: functionCall.name,
      response: {
        result: toolResponse,
      },
    };

    // Send the function response back to the model.
    contents.push({
      role: "model",
      parts: [
        {
          functionCall: functionCall,
        },
      ],
    });
    contents.push({
      role: "user",
      parts: [
        {
          functionResponse: functionResponsePart,
        },
      ],
    });
  } else {
    // No more function calls, break the loop.
    console.log(result.text);
    break;
  }
}
```

Function calling modes

The Gemini API lets you control how the model uses the provided tools (function declarations). Specifically, you can set the mode within the.function_calling_config.

    AUTO (Default): The model decides whether to generate a natural language response or suggest a function call based on the prompt and context. This is the most flexible mode and recommended for most scenarios.
    ANY: The model is constrained to always predict a function call and guarantees function schema adherence. If allowed_function_names is not specified, the model can choose from any of the provided function declarations. If allowed_function_names is provided as a list, the model can only choose from the functions in that list. Use this mode when you require a function call response to every prompt (if applicable).
    NONE: The model is prohibited from making function calls. This is equivalent to sending a request without any function declarations. Use this to temporarily disable function calling without removing your tool definitions.

    VALIDATED (Preview): The model is constrained to predict either function calls or natural language, and ensures function schema adherence. If allowed_function_names is not provided, the model picks from all of the available function declarations. If allowed_function_names is provided, the model picks from the set of allowed functions


---

Schedule Meeting example:

```ts
import { GoogleGenAI, Type } from '@google/genai';

// Configure the client
const ai = new GoogleGenAI({});

// Define the function declaration for the model
const scheduleMeetingFunctionDeclaration = {
  name: 'schedule_meeting',
  description: 'Schedules a meeting with specified attendees at a given time and date.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      attendees: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of people attending the meeting.',
      },
      date: {
        type: Type.STRING,
        description: 'Date of the meeting (e.g., "2024-07-29")',
      },
      time: {
        type: Type.STRING,
        description: 'Time of the meeting (e.g., "15:00")',
      },
      topic: {
        type: Type.STRING,
        description: 'The subject or topic of the meeting.',
      },
    },
    required: ['attendees', 'date', 'time', 'topic'],
  },
};

// Send request with function declarations
const response = await ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: 'Schedule a meeting with Bob and Alice for 03/27/2025 at 10:00 AM about the Q3 planning.',
  config: {
    tools: [{
      functionDeclarations: [scheduleMeetingFunctionDeclaration]
    }],
  },
});

// Check for function calls in the response
if (response.functionCalls && response.functionCalls.length > 0) {
  const functionCall = response.functionCalls[0]; // Assuming one function call
  console.log(`Function to call: ${functionCall.name}`);
  console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);
  // In a real app, you would call your actual function here:
  // const result = await scheduleMeeting(functionCall.args);
} else {
  console.log("No function call found in the response.");
  console.log(response.text);
}
```

Create Chart Example

```ts
import { GoogleGenAI, Type } from '@google/genai';

// Configure the client
const ai = new GoogleGenAI({});

// Define the function declaration for the model
const createChartFunctionDeclaration = {
  name: 'create_bar_chart',
  description: 'Creates a bar chart given a title, labels, and corresponding values.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'The title for the chart.',
      },
      labels: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of labels for the data points (e.g., ["Q1", "Q2", "Q3"]).',
      },
      values: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
        description: 'List of numerical values corresponding to the labels (e.g., [50000, 75000, 60000]).',
      },
    },
    required: ['title', 'labels', 'values'],
  },
};

// Send request with function declarations
const response = await ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: "Create a bar chart titled 'Quarterly Sales' with data: Q1: 50000, Q2: 75000, Q3: 60000.",
  config: {
    tools: [{
      functionDeclarations: [createChartFunctionDeclaration]
    }],
  },
});

// Check for function calls in the response
if (response.functionCalls && response.functionCalls.length > 0) {
  const functionCall = response.functionCalls[0]; // Assuming one function call
  console.log(`Function to call: ${functionCall.name}`);
  console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);
  // In a real app, you would call your actual function here:
  // const result = await createBarChart(functionCall.args);
} else {
  console.log("No function call found in the response.");
  console.log(response.text);
}

```

---

- Notes from before compaction:


● Write(~/.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/project_gemini_file_search.md)
  ⎿  Wrote 91 lines to ../../../.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/project_gemini_file_search.md
       1 ---
       2 name: Gemini File Search Implementation
       3 description: In-progress implementation of custom file_search function calling for Gemini models, threading UserStoreVectorService through the class hierarchy
       4 type: project
       5 ---
       6
       7 ## Status: IN PROGRESS — workup.ts imports added, constructor + methods + chat.ts tool loop still pending
       8
       9 ## What's Done (Partitioned Foraging / Hybrid Search)
      10 All completed for Anthropic, OpenAI, Meta, v0 providers:
     … +81 lines (ctrl+o to expand)

● Read 1 file (ctrl+o to expand)

● Write(~/.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/MEMORY.md)
  ⎿  Wrote 11 lines to ../../../.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/MEMORY.md
       1 # Memory Index
       2
       3 ## Project
       4 - [Gemini File Search Implementation](project_gemini_file_search.md) — In-progress: adding custom file_search function calling to Gemini models via UserStoreVectorService, threading through class hierarchy. Partitioned foraging (hybrid search) already comple
         te for Anthropic, OpenAI, Meta, v0.
       5
       6 ## User
       7 - [User Profile](user_profile.md) — Solo developer, preferences for script patterns, ESLint conventions
       8
       9 ## Feedback
      10 - [ESLint Array Syntax](feedback_eslint_array.md) — Use `readonly T[]` not `ReadonlyArray<T>`; use `T[]` not `Array<T>`
     … +1 line (ctrl+o to expand)

● Write(~/.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/user_profile.md)
  ⎿  Wrote 13 lines to ../../../.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/user_profile.md
       1 ---                                                                                                       
       2 name: User Profile
       3 description: Solo developer on t3-chat-clone, experienced TypeScript dev with strong opinions on type safety and code quality
       4 type: user
       5 ---                                                                                                                                                                                                                                                                      
       6                                                                                  
       7 - Solo developer — only person touching this repo
       8 - Deep TypeScript expertise, strong opinions on type safety (see CLAUDE.md hard rules)                                                                                                                                                                                   
       9 - Appreciates well-crafted scripts ("quality scripts are my shit")
      10 - Prefers concise, direct communication                                                                                                                                                                                                                                  
     … +3 lines (ctrl+o to expand)                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                                
● Write(~/.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/feedback_eslint_array.md)                                                                                                                                                               
  ⎿  Wrote 11 lines to ../../../.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/feedback_eslint_array.md                                                                                                                                          
       1 ---                                                                                                                                                                                                                                                                      
       2 name: ESLint Array Syntax                                                                                                                                                                                                                                                
       3 description: Use readonly T[] not ReadonlyArray<T>, and T[] not Array<T> per ESLint config                                                                                                                                                                               
       4 type: feedback                                                                   
       5 ---
       6                                                                                                                                                                                                                                                                          
       7 Use `readonly T[]` instead of `ReadonlyArray<T>`.
       8 Use `T[]` instead of `Array<T>` for type annotations.                                                                                                                                                                                                                    
       9                                                                                                                                                                                                                                                                        
      10 **Why:** ESLint is configured to enforce this syntax style.                                                                                                                                                                                                            
     … +1 line (ctrl+o to expand)                                                                                                                                                                                                                                                 
                                                                                                                                                                                                                                                                                  
● Write(~/.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/feedback_script_args.md)                                                                                                                                                                
  ⎿  Wrote 16 lines to ../../../.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone-turborepo/memory/feedback_script_args.md                                                                                                                                           
       1 ---                                                                                                                                                                                                                                                                      
       2 name: Script Argument Pattern                                                    
       3 description: Use positional argv flags with gated execution at bottom of file, not parseArgs() functions
       4 type: feedback                                                                                                                                                                                                                                                           
       5 ---
       6                                                                                                                                                                                                                                                                          
       7 For standalone scripts (test/backfill scripts), use explicit positional `process.argv` flags:                                                                                                                                                                          
       8 - `argv[3]` = first flag value (e.g., `--env dev`)                                                                                                                                                                                                                     
       9 - `argv[5]` = second flag value (e.g., `--size 200`)                                                                                                                                                                                                                     
      10 - `argv[7]` = third flag value (e.g., `--dry true`)                                                                                                                                                                                                                      
     … +6 lines (ctrl+o to expand)                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                  
✢ Compacting conversation… (1m 19s · ↑ 2.2k tokens)
  ⎿  Tip: Use /btw to ask a quick side question without interrupting Claude's current work
