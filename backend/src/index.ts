import { buildApp } from "./app.js";
import { prisma } from "./db.js";
import { keepDefaultBranchesIn, warmBranches } from "./scraper/shopriteGroup.js";
import { databaseStore } from "./scraper/rememberedStore.js";
import { keepCreditsIn } from "./scraper/credits.js";
import { databaseLedger } from "./scraper/creditLedger.js";
import { warmDefaultStore } from "./scraper/pnp.js";
import { assertMailConfigured } from "./mail/mailer.js";
import { sweepExpiredLinksHourly } from "./expiredLinks.js";

// #147: no key, no start, in production. A deploy then refuses the new
// version instead of shipping one that can't send email.
assertMailConfigured();

// #157: default branches survive restarts, so a deploy doesn't pay
// ScraperAPI to find them again.
keepDefaultBranchesIn(databaseStore);
// ...and so do the counts of ScraperAPI credits spent.
keepCreditsIn(databaseLedger);

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
  sweepExpiredLinksHourly((err) => app.log.error({ err }, "deleting expired sign-up and reset links failed"));
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
