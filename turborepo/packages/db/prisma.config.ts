import type { PrismaConfig } from "prisma/config";
import { defineConfig } from "prisma/config";
import "dotenv/config";
import { relative } from "node:path";

export default defineConfig({
  schema: relative(process.cwd(), "prisma/schema"),
  typedSql: {
    path: relative(process.cwd(), "prisma/sql")
  },
  migrations: {
    path: relative(process.cwd(), "prisma/migrations")
  }
} satisfies PrismaConfig);
