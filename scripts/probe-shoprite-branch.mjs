// Why does Shoprite without a location miss products (#196)?
//
// The read-only check (scripts/diag-search.sh) showed Shoprite's default
// branch, used when a list has no location, answers searches but found
// nothing for "yum yum", while a branch from a location found 9. The default
// is a Sixty60 store and the online store only; Checkers' default also has a
// one-day-delivery store. This compares the two directly:
//
//   1. the default branch, and the branches lists use, with each store's
//      delivery type and how many lists use it (free: the database)
//   2. the same searches at the default and at the most used other branch
//      (one ScraperAPI credit each: 4 with the default two queries)
//
// Run inside the backend container and post the output to #196:
//
//   curl -fsSL -o /tmp/probe-shoprite-branch.mjs \
//     https://raw.githubusercontent.com/ethichadebe/Brittle-AI/claude/new-session-nwbjsc/scripts/probe-shoprite-branch.mjs
//   cd /opt/accucery && bash scripts/report.sh 196 -- sh -c \
//     'docker compose -f docker-compose.prod.yml exec -T backend \
//        node --input-type=module < /tmp/probe-shoprite-branch.mjs'
//
// Reads from /app (the container's working directory). Prints store names
// and ids, never a list, an account or a location.

import { PrismaClient } from "@prisma/client";
import { ShopriteScraper, contextsZone } from "./dist/scraper/shopriteGroup.js";

const QUERIES = (process.env.QUERIES || "yum yum,peanut butter").split(",").map((q) => q.trim()).filter(Boolean);
const prisma = new PrismaClient();
const say = (s = "") => console.log(s);
const describe = (contexts) =>
  contexts.map((c) => `${String(c.storeId).slice(-6)} ${(c.serviceOptionIds ?? []).join("+") || "?"}`).join("; ");

say(`Shoprite branch probe, queries: ${QUERIES.join(", ")}\n`);

const kept = await prisma.rememberedValue.findUnique({ where: { key: "default-branch:Shoprite" } });
const defaults = Array.isArray(kept?.value) ? kept.value : [];
say("== Default branch (no location) ==");
say(defaults.length ? `zone ${contextsZone(defaults)}: ${describe(defaults)}` : "none remembered");

const lists = await prisma.list.findMany({ where: { storeSlug: "shoprite", NOT: { branch: { equals: null } } }, select: { branch: true } });
const byZone = new Map();
for (const { branch } of lists) {
  const contexts = Array.isArray(branch?.contexts) ? branch.contexts : null;
  if (!contexts) continue;
  const zone = contextsZone(contexts);
  const seen = byZone.get(zone) ?? { name: String(branch.name ?? "?"), contexts, lists: 0 };
  seen.lists++;
  byZone.set(zone, seen);
}
say(`\n== Branches Shoprite lists use (${lists.length} lists with one) ==`);
const ranked = [...byZone.entries()].sort((a, b) => b[1].lists - a[1].lists);
for (const [zone, b] of ranked.slice(0, 10)) say(`zone ${zone}, ${b.lists} list(s), ${b.name}: ${describe(b.contexts)}`);

const other = ranked.find(([zone]) => zone !== contextsZone(defaults));
const scraper = new ShopriteScraper();
say("\n== Same searches, side by side (1 credit each) ==");
for (const q of QUERIES) {
  // The remembered default is passed as a branch: given none, a script
  // outside the server would look the default up again, a dozen credits.
  const sides = [["default", defaults.length ? { name: "default", contexts: defaults } : null]];
  if (other) sides.push([other[1].name, { name: other[1].name, contexts: other[1].contexts }]);
  for (const [label, branch] of sides) {
    if (!branch) {
      say(`"${q}" at ${label}: skipped, no default branch remembered`);
      continue;
    }
    try {
      const found = await scraper.search(q, branch);
      say(`"${q}" at ${label}: ${found.length} products${found.length ? ` - ${found.slice(0, 3).map((p) => p.name).join(" | ")}` : ""}`);
    } catch (e) {
      say(`"${q}" at ${label}: failed, ${String(e?.message ?? e).slice(0, 100)}`);
    }
  }
}
await prisma.$disconnect();
