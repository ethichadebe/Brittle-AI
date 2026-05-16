import { buildApp } from "./app.js";
import { prisma } from "./db.js";

const app = await buildApp({ logger: true });

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

try {
  await app.listen({ port: 3000, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
