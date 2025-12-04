import type { PrismaConfig } from "prisma/config";
import { defineConfig, env } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
} satisfies PrismaConfig);
