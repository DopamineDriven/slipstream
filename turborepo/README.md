# Pnpm Workspace (Turborepo)

#### add injectable output type support (passing a generic arg on use) by augmenting internal `parse` method

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


