import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export class DbService {
  readonly prismaClient;
  private adapter;
  constructor(connectionString: string, poolMax = 100, idleTimeoutMs = 30000) {
    this.adapter = new PrismaPg({
      connectionString,
      max: poolMax,
      idleTimeoutMillis: idleTimeoutMs
    });
    this.prismaClient = new PrismaClient({
      adapter: this.adapter,
      errorFormat: "pretty"
    });
  }
}

export type { PrismaClient } from "./generated/prisma/client.ts";
