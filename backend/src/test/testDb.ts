import { PrismaClient } from "@prisma/client";

export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL_TEST ??
        "postgresql://accucery:accucery@localhost:5432/accucery_test",
    },
  },
});
