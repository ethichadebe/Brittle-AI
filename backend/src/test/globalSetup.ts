import { PrismaClient } from "@prisma/client";

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://accucery:accucery@localhost:5432/accucery_test";

export async function setup() {
  // Verify test DB is reachable — schema must be applied before running tests.
  // Run: DATABASE_URL=<TEST_DB_URL> npx prisma migrate deploy
  const client = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  await client.$connect();
  await client.$disconnect();
}
