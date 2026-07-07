declare global {
  interface JSON {
    parse<T = unknown>(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): T;
  }
  interface Body {
    json<T = unknown>(): Promise<T>;
  }
  interface ObjectConstructor {
    // PropertyKey -> string and number allowed, symbol disallowed (symbol can't be enumerable)
    keys<T = object>(
      o: T
    ): (keyof T extends infer K
      ? K extends string
        ? K
        : K extends number
          ? `${K}`
          : never
      : never)[];
  }
}

export { CliConfigService } from "@/config.ts";
export { SlipstreamClientService } from "@/client.ts";
export { CliProviderContextService } from "@/provider-context.ts";
export { CliRendererService } from "@/render.ts";
export { SlipstreamReplService } from "@/repl.ts";
export { CLI_MODELS } from "@/types.ts";
export type {
  ChatSessionState,
  CliModelEntry,
  CliRosterEntry
} from "@/types.ts";
