import type { AttachmentSingleton, DocumentSingleton } from "@slipstream/types";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

export type AccessTokenResProps = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export class AdobeTest {
  /**
   * key -> clientId
   */
  private bearerMap = new Map<
    string,
    { access_token: string; expiresAt: number }
  >();
  constructor(
    private clientId: string,
    private clientSecret: string
  ) {}

  public async getAdobeAccessToken() {
    const cached = this.bearerMap.get(this.clientId);
    if (cached?.expiresAt && cached?.expiresAt - Date.now() >= 60000) {
      return { access_token: cached.access_token, expiresAt: cached.expiresAt };
    } else {
      const res = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
        body: new URLSearchParams([
          ["grant_type", "client_credentials"],
          ["client_id", this.clientId],
          ["client_secret", this.clientSecret],
          ["scope", "openid,AdobeID,DCAPI"]
        ])
      });
      if (!res.ok) {
        throw new Error(`Adobe auth failed: ${res.status}`);
      }
      const payload = await res.json<AccessTokenResProps>();
      this.bearerMap.set(this.clientId, {
        access_token: payload.access_token,
        expiresAt: Date.now() + payload.expires_in * 1000
      });
      return {
        access_token: payload.access_token,
        expiresAt: Date.now() + payload.expires_in * 1000
      };
    }
  }
}

const _x = () =>
  (async () => {
    const { Credentials } = await import("@slipstream/credentials");
    const cfg = new Credentials();

    const [id, secret] = await Promise.all([
      cfg.get("PDF_SERVICES_CLIENT_ID"),
      cfg.get("PDF_SERVICES_CLIENT_SECRET")
    ]);
    const adobe = new AdobeTest(id, secret);

    const auth = await adobe.getAdobeAccessToken();
    return auth;
  })().then(data => {
    console.log(data);
    return data;
  });
type AssetRT =
  | ({ document: DocumentSingleton | null } & Omit<
      AttachmentSingleton,
      "image"
    >)
  | null;

const _asset = () =>
  (async () => {
    const { PrismaClient } = await import(
      "@slipstream/db/node/generated/client"
    );
    const { Credentials } = await import("@slipstream/credentials");
    const cfg = new Credentials();
    const [datasourceUrl, _direct] = await Promise.all([
      cfg.get("DATABASE_URL"),
      cfg.get("DIRECT_URL")
    ]);
    const prisma = new PrismaClient({ datasourceUrl });
    let asset: AssetRT = null;
    try {
      prisma.$connect();
      asset = await prisma.attachment.findUnique({
        where: { id: "niggfu0z0og5g4rvof330g84" },
        include: { document: true, imageGenOutput: true }
      });
    } catch (err) {
      console.log(err);
    } finally {
      prisma.$disconnect();
      return asset;
    }
  })().then(t => {
    console.log(t);
    return t;
  });


  // Using your DeepReplace utility
export type DeepBigIntToNumber<T> = DeepReplace<T, bigint, number>;

// But let's make DeepReplace even more robust without any
export type DeepReplace<T, From, To> = T extends From
  ? To
  : T extends readonly (infer U)[]
  ? readonly DeepReplace<U, From, To>[]
  : T extends (infer U)[]
  ? DeepReplace<U, From, To>[]
  : T extends Map<infer K, infer V>
  ? Map<K, DeepReplace<V, From, To>>
  : T extends Set<infer U>
  ? Set<DeepReplace<U, From, To>>
  : T extends Promise<infer U>
  ? Promise<DeepReplace<U, From, To>>
  : T extends (...args: infer Args) => infer R
  ? (...args: Args) => DeepReplace<R, From, To>
  : T extends object
  ? { [K in keyof T]: DeepReplace<T[K], From, To> }
  : T;

// Generic deep transformer without any
export function deepTransform<T, TResult = T>(
  value: T,
  transformer: <V>(val: V, path: readonly string[]) => unknown,
  path: readonly string[] = [],
  visited = new WeakSet<object>()
): TResult {
  // Handle primitives and null/undefined
  if (value === null || value === undefined || typeof value !== 'object') {
    return transformer(value, path) as TResult;
  }

  // Prevent circular references
  if (visited.has(value as object)) {
    return value as unknown as TResult;
  }
  visited.add(value as object);

  // Arrays
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      // eslint-disable-next-line
      deepTransform(item, transformer, [...path, String(index)], visited)
    ) as unknown as TResult;
  }

  // Maps
  if (value instanceof Map) {
    const result = new Map();
    let index = 0;
    for (const [k, v] of value) {
      result.set(
        k,
        deepTransform(v, transformer, [...path, `map[${index}]`], visited)
      );
      index++;
    }
    return result as unknown as TResult;
  }

  // Sets
  if (value instanceof Set) {
    const result = new Set();
    let index = 0;
    for (const item of value) {
      result.add(
        deepTransform(item, transformer, [...path, `set[${index}]`], visited)
      );
      index++;
    }
    return result as unknown as TResult;
  }

  // Plain objects
        // eslint-disable-next-line
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = deepTransform(
        (value as Record<string, unknown>)[key],
        transformer,
        [...path, key],
        visited
      );
    }
    return result as unknown as TResult;
  }

  // Other objects (Date, RegExp, class instances)
  return transformer(value, path) as TResult;
}

// Specific bigint converter using the generic transformer
export function deepConvertBigIntToNumber<T>(value: T): DeepBigIntToNumber<T> {
  return deepTransform<T, DeepBigIntToNumber<T>>(
    value,
    (val) => typeof val === 'bigint' ? Number(val) : val
  );
}
