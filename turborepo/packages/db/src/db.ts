import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export class DbService {
  readonly prismaClient: PrismaClient;
  private adapter: PrismaPg;
  constructor(connectionString: string, poolMax = 10, idleTimeoutMs = 30000) {
    this.adapter = new PrismaPg({
      connectionString,
      max: poolMax,
      idleTimeoutMillis: idleTimeoutMs
    });
    this.prismaClient = new PrismaClient({ adapter: this.adapter });
  }
}

export type { PrismaClient } from './generated/prisma/client'
