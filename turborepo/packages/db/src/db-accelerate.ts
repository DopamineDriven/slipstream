import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "./generated/prisma/client.ts";

export class DbServiceAccelerate {
  readonly prismaClient;
  constructor(connectionString: string, _poolMax = 100, idleTimeoutMs = 20000) {
    this.prismaClient = new PrismaClient({
      accelerateUrl: connectionString,
      transactionOptions: { timeout: idleTimeoutMs },
      errorFormat: "pretty"
    }).$extends(withAccelerate());
  }
}

export type { PrismaClient } from "./generated/prisma/client.ts";
