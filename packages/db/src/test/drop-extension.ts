import * as dotenv from "dotenv";

dotenv.config({ quiet: true });
async function dropExtension() {
  const previewConnectionString =
    process.env.DIRECT_URL ??
    "";

  // Instantiate the service with preview opts (no shared instance needed for one-off)
  const { PrismaClient } = await import("@/generated/prisma/client.ts");
  const prisma = new PrismaClient({ accelerateUrl: previewConnectionString });
  try {
    // Use the NON-Accelerate client to be safest (bypasses any caching layer)

    await prisma.$executeRaw`DROP EXTENSION IF EXISTS pg_stat_statements CASCADE;`;

    console.log("✅ pg_stat_statements dropped successfully on preview DB");
    console.log(
      "   Query insights in console will pause until re-created later."
    );
  } catch (error) {
    console.error("❌ Failed to drop extension:", error);
    console.error("   Common causes:");
    console.error(
      "   - Wrong connection string (double-check preview direct URL)"
    );
    console.error("   - Permissions (unlikely on Prisma-hosted, but possible)");
    console.error("   - Accelerate interference (try p(false) as above)");
    console.error("\n   Fallback: Use psql with the same connection string:");
    console.error(
      `   psql "${previewConnectionString}" -c "DROP EXTENSION IF EXISTS pg_stat_statements CASCADE;"`
    );
  } finally {
    await prisma.$disconnect();
  }
}

dropExtension();
