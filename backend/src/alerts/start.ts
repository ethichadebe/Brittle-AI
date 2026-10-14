import { createIncidents, databaseIncidentStore } from "./incidents.js";
import { createStoreHealth } from "./storeHealth.js";
import { checkCredits } from "./creditAlerts.js";
import { telegramFromEnv } from "./telegram.js";
import { observeSearches } from "../scraper/engine.js";
import { scraperApiAccount } from "../scraper/creditReport.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// #155: the app's own alerts. The site being down and a failed deploy are
// already messaged by ethichadebe/workflows (monitor.yml, compose-deploy.yml)
// through the same bot; these are what only the app can see.
export function startAlerts(log: (msg: string, err?: unknown) => void): void {
  const notifier = telegramFromEnv();
  if (!notifier) {
    log("alerts are off: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to turn them on");
    return;
  }
  const incidents = createIncidents(databaseIncidentStore(), notifier, (msg) => log(msg));
  const health = createStoreHealth(incidents);
  observeSearches((store, error) => {
    health.searched(store, error).catch((err) => log("[alerts] store health check failed", err));
  });

  // Asking ScraperAPI about the account is free. Hourly is plenty: a free
  // month's 1,000 credits don't go from 80% to 100% in an hour.
  const credits = () => checkCredits(incidents, scraperApiAccount).catch((err) => log("[alerts] credit check failed", err));
  setTimeout(credits, MINUTE).unref();
  setInterval(credits, HOUR).unref();
}
