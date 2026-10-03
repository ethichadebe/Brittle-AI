import { buildApp } from "./app.js";
import { prisma } from "./db.js";
import { warmBranches } from "./scraper/shopriteGroup.js";
import { warmDefaultStore } from "./scraper/pnp.js";

const app = await buildApp({ logger: true });

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

try {
  await app.listen({ port: 3000, host: "0.0.0.0" });
  // Look up the Checkers, Shoprite (#66) and Pick n Pay (#132) default
  // stores now rather than on the first search. Never throws: a failed
  // lookup is logged and retried.
  warmBranches();
  warmDefaultStore();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
