### Welcome to the `@t3-chat-clone/*` workspace 👋

#### add built-in output type support as a generic arg by augmenting internal JSON.parse method

```ts
declare global {
  interface JSON {
    parse<T = unknown>(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): T;
  }
}
```
