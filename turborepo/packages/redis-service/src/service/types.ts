import type {
  RedisClientType,
  RedisDefaultModules,
  RedisFunctions,
  RedisModules,
  RedisScripts,
  RespVersions,
  TypeMapping
} from "redis";

export type RedisClientEntity = RedisClientType<
    RedisDefaultModules & RedisModules,
    RedisFunctions,
    RedisScripts,
    RespVersions,
    TypeMapping
  >;
export type RedisArg = string | Buffer<ArrayBufferLike>;

export type RedisHashType = number | RedisArg;

export type RedisVariadicArg = RedisArg | RedisArg[];
