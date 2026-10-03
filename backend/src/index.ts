import { buildApp } from "./app.js";
import { prisma } from "./db.js";
import { warmBranches } from "./scraper/shopriteGroup.js";

const app = await buildApp({ logger: true });

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

try {
  await app.listen({ port: 3000, host: "0.0.0.0" });
  // Look up the Checkers and Shoprite branches now rather than on the first
  // search (#66). Never throws: a failed lookup is logged and retried.
  warmBranches();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
