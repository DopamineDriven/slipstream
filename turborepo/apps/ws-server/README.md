# WS-SERVER

 ```ts
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: 'What is the current stock price for GOOGL?',
    config: {
      tools: [{googleSearch: {}}],
      toolConfig: {
        retrievalConfig: {
          latLng: {latitude: 37.7749, longitude: -122.4194},
        },
      },
    },
  });
    ```
