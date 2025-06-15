// src/index.ts
import { Resolver } from "./resolver/index.ts";
import { WSServer } from "./ws-server/index.ts";
import * as dotenv from "dotenv";
dotenv.config();


const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const jwtSecret =
  process.env.JWT_SECRET ?? "QzItEuoPfuEZyoll41Zw8x+l0/8jSJxZYbpQ76dk4vI=";

const port = process.env.PORT ? Number.parseInt(process.env.PORT) : 4000;

const wsServer = new WSServer({ port, redisUrl, jwtSecret });
const resolver = new Resolver(wsServer);
resolver.registerAll();
wsServer.setResolver(resolver);

wsServer.start();

export {};
