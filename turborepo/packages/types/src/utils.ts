import type { $Enums } from "@slipstream/db/node/generated/client";
export type Unenumerate<T> = T extends (infer U)[] | readonly (infer U)[]
  ? U
  : T;

export type BigIntKeys<T> = {
  [K in keyof T]: T[K] extends bigint ? K : never;
}[keyof T];

export type SerializeBigInt<T, Serialized extends boolean = boolean> = DX<{
  [K in keyof T]: T[K] extends bigint | null | undefined
    ? Serialized extends true
      ? Exclude<T[K], bigint> | number
      : T[K]
    : T[K];
}>;

// precision (field-level) targeting
export type PrecisionSerializeBigIntField<
  T,
  Field extends keyof T = BigIntKeys<T>,
  Serialized extends boolean = false
> = DX<{
  [K in keyof T]: K extends Field
    ? Serialized extends true
      ? number | null
      : bigint | null
    : T[K];
}>;

export type Rm<T, P extends keyof T = keyof T> = {
  [S in keyof T as Exclude<S, P>]: T[S];
};

/**
 * helper workup for use in XOR type below
 * makes properties from U optional and undefined in T, and vice versa
 */
export type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

export type Include<T, U extends T> = Exclude<T, Exclude<T, U>>;

/**
 * enforces mutual exclusivity of T | U
 */
// prettier-ignore
export type XOR<T, U> =
  [T, U] extends [object, object]
    ? (Without<T, U> & U) | (Without<U, T> & T)
    : T | U

/**
 * CTR (Conditional to Required)
 *
 * - By default: makes all **optional** properties required.
 * - With K: makes only the specified optional keys required.
 */
export type CTR<
  T,
  K extends keyof OnlyOptional<T> = keyof OnlyOptional<T>
> = Rm<T, K> & {
  [Q in K]-?: T[Q];
};

/**
 * RTC (Required to Conditional)
 *
 * - By default: makes all **required** properties optional.
 * - With K: makes only the specified required keys optional.
 */
export type RTC<
  T,
  K extends keyof OnlyRequired<T> = keyof OnlyRequired<T>
> = Rm<T, K> & {
  [Q in K]?: T[Q];
};
export type IsExact<T, U> = [T] extends [U]
  ? [U] extends [T]
    ? true
    : false
  : false;

/**
 * TCN (To Conditionally Never)
 */
export type TCN<T, X extends keyof T = keyof T> = Rm<T, X> & {
  [Q in X]?: XOR<T[Q], never>;
};

/**
 * export type ArrFieldReplacer<
  T extends unknown[] | readonly unknown[],
  V extends keyof Unenumerate<T>,
  Q extends boolean = false,
  P = unknown
> = T extends (infer U)[] | readonly (infer U)[]
  ? V extends keyof U
    ? Q extends true
      ? P extends Record<infer Z, infer S>
        ? [...[DX<{ [C in Z]: S } & Rm<U, V>>]][number][]
        : (Rm<U, V> & P)[]
      : Q extends false
        ? Rm<U, V>[]
        : U
    : T
  : T;
 */

export type ArrFieldReplacer<
  T extends unknown[] | readonly unknown[],
  V extends keyof Unenumerate<T>,
  Q extends boolean = false,
  P = unknown
> = T extends (infer U)[] | readonly (infer U)[]
  ? V extends keyof U
    ? Q extends true
      ? P extends Record<infer Y, infer X>
        ? (Rm<U, V> & Record<Y, X>)[]
        : (Rm<U, V> & P)[]
      : Q extends false
        ? Rm<U, V>[]
        : U
    : T
  : T;

export type IsOptional<T, K extends keyof T> = undefined extends T[K]
  ? object extends Pick<T, K>
    ? true
    : false
  : false;

export type OnlyOptional<T> = {
  [K in keyof T as IsOptional<T, K> extends true ? K : never]: T[K];
};

export type OnlyRequired<T> = {
  [K in keyof T as IsOptional<T, K> extends false ? K : never]: T[K];
};

/**
 * workup for next.js dynamic route generate static params handling
 */
export type InferGSPRTWorkup<T> =
  T extends Promise<readonly (infer U)[] | (infer U)[]> ? U : T;

/**
 * infer generate static params return type in next.js dynamic routes
 */
export type InferGSPRT<V extends (...args: any) => any> = {
  params: Promise<InferGSPRTWorkup<ReturnType<V>>>;
};

/**
 * Expect that the thing passed to Expect<T> is true.
 *
 * For instance, `Expect<true>` won't error. But
 * `Expect<false>` will error.
 */
export type Expect<T extends true> = T;

/**
 * Checks that X and Y are exactly equal.
 *
 * For instance, `Equal<'a', 'a'>` is true. But
 * `Equal<'a', 'b'>` is false.
 *
 * This also checks for exact intersection equality. So
 * `Equal<{ a: string; b: string  }, { a: string; b: string }>`
 * is true. But `Equal<{ a: string; b: string  }, { a: string; } & { b: string }>`
 * is false.
 */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/**
 * Checks that Y is assignable to X.
 *
 * For instance, `Extends<string, 'a'>` is true. This is because
 * 'a' can be passed to a function which expects a string.
 *
 * But `Extends<'a', string>` is false. This is because a string
 * CANNOT be passed to a function which expects 'a'.
 */
export type Extends<X, Y> = Y extends X ? true : false;

export type DX<Y> = {
  [P in keyof Y]: Y[P];
};

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type DeepPartialFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: DeepPartial<T[P]>;
};

// Recursive type replacement
export type DeepReplace<T, From, To> = T extends From
  ? To
  : T extends object
    ? { [K in keyof T]: DeepReplace<T[K], From, To> }
    : T;

// Make certain nested fields required
export type RequireNested<
  T,
  Path extends string
> = Path extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? Rm<T, K> & Record<K, RequireNested<Required<T>[K], Rest>>
    : T
  : Path extends keyof T
    ? Rm<T, Path> & Record<Path, Required<T>[Path]>
    : T;

export type FlexiCase<T extends string> = Lowercase<T> | Uppercase<T>;

export function createDraftId(
  userId: string,
  conversationId: string,
  batchId: string,
  ordinal: number
) {
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new Error("ordinal must be a non-negative integer");
  }
  if (
    ![userId, conversationId, batchId].every(s => /^[A-Za-z0-9_-]+$/.test(s))
  ) {
    throw new Error("ids must be [A-Za-z0-9_-]+");
  }
  return `${userId}~${conversationId}~${batchId}~${ordinal}` as const;
}
/**
 * returns `[string, string, string, number]`
 *
 * corresponds to `[userId, conversationId, batchId, ordinal (asset count)]`
 *
 * which is the anatomy of an asset draftId
 */
export function parseDraftId(draftId: string) {
  if (/^(?:[A-Za-z0-9_-]+~){3}(?:0|[1-9][0-9]*)$/.test(draftId) === false) {
    throw new Error(`invalid draftId ${draftId}`);
  }
  const toArr = draftId.split("~");

  return toArr.map((v, o) =>
    o !== toArr.length - 1 ? v : Number.parseInt(v, 10)
  ) as [string, string, string, number];
}

export function instanceFunc<const Type>(c: new (...args: Type[]) => Type) {
  return new c();
}

// export type IsNever<T> = [T] extends [never] ? true : false;

// /**
//  * Check if a key's value type is never
//  */
// export type IsKeyNever<T, K extends keyof T> = IsNever<T[K]>;

// /**
//  * Extract keys whose values are NOT never
//  */
// export type NonNeverKeys<T> = {
//   [K in keyof T]: IsNever<T[K]> extends true ? never : K;
// }[keyof T];

// /**
//  * Extract keys whose values ARE never
//  */
// export type NeverKeys<T> = {
//   [K in keyof T]: IsNever<T[K]> extends true ? K : never;
// }[keyof T];

// /**
//  * Strip all `never`-valued keys from a type
//  */
// export type StripNever<T> = {
//   [K in NonNeverKeys<T>]: T[K];
// };

// /**
//  * Get the non-never type of a key, or `never` if the key doesn't exist or is never
//  */
// export type NonNeverValue<T, K extends PropertyKey> = K extends keyof T
//   ? IsNever<T[K]> extends true
//     ? never
//     : T[K]
//   : never;

// // ============================================================================
// // Type Predicates for Field Checking
// // ============================================================================

// /**
//  * Check if object has a key with a non-never, non-undefined value
//  * Returns a type predicate that narrows the object type
//  */
// export function has<const T extends object, const K extends string>(
//   obj: T,
//   key: K
// ): obj is T & Record<K, Exclude<NonNeverValue<T, K>,null>> {
//   return (
//     key in obj &&
//     typeof (obj as Record<string, unknown>)[key] !== "undefined" &&
//     (obj as Record<string, unknown>)[key] !== null
//   );
// }
export type CommonDiscriminants =
  | "type"
  | "kind"
  | "event"
  | "tag"
  | "_tag"
  | "__typename";
// type CommonDiscriminantObj<T extends CommonDiscriminants = CommonDiscriminants> = readonly [Include<CommonDiscriminants,T>,string];

// const O =(props: CommonDiscriminantObj<"type">)=>({[props[0]]: props[1]})
export type LiteralUnion<TKnown extends string> = TKnown | string;

export type DiscriminatedUnionToRecord<
  TUnion extends Record<TKey, string>,
  TKey extends LiteralUnion<CommonDiscriminants> =
    LiteralUnion<CommonDiscriminants>
> = TKey extends keyof TUnion
  ? { [K in TUnion[TKey] & string]: Extract<TUnion, Record<TKey, K>> }
  : never;

export type UnionToRecord<
  TUnion extends Record<"type", string>,
  TDiscriminant extends string = TUnion["type"]
> = {
  [K in TDiscriminant]: Extract<TUnion, { type: K }>;
};
export type Signals =
  | "SIGABRT"
  | "SIGALRM"
  | "SIGBREAK"
  | "SIGBUS"
  | "SIGCHLD"
  | "SIGCONT"
  | "SIGFPE"
  | "SIGHUP"
  | "SIGILL"
  | "SIGINFO"
  | "SIGINT"
  | "SIGIO"
  | "SIGIOT"
  | "SIGKILL"
  | "SIGLOST"
  | "SIGPIPE"
  | "SIGPOLL"
  | "SIGPROF"
  | "SIGPWR"
  | "SIGQUIT"
  | "SIGSEGV"
  | "SIGSTKFLT"
  | "SIGSTOP"
  | "SIGSYS"
  | "SIGTERM"
  | "SIGTRAP"
  | "SIGTSTP"
  | "SIGTTIN"
  | "SIGTTOU"
  | "SIGUNUSED"
  | "SIGURG"
  | "SIGUSR1"
  | "SIGUSR2"
  | "SIGVTALRM"
  | "SIGWINCH"
  | "SIGXCPU"
  | "SIGXFSZ";

export type FlexiProvider = FlexiCase<$Enums.Provider>;
/**
 * retained to support repos still using it
 */
export type BigIntOrNumber<T extends boolean = false> = T extends true
  ? number
  : bigint;
