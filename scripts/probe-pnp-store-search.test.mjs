// Offline test for scripts/probe-pnp-store-search.mjs. No network, no stores.
//
//   node scripts/probe-pnp-store-search.test.mjs
//
// A stand-in Pick n Pay that prices by the storeCode in the search URL, with
// a cart that starts at a default store and moves when given an address -
// the shapes recorded on #66, with invented products and prices - and a
// stand-in ScraperAPI. Whether the real site answers plain requests from the
// VPS is what the live run is for.

import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)), "probe-pnp-store-search.mjs");
const KEY = "test-key-7c1d";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ok   ${n}`); };
const bad = (n, why) => { fail++; console.log(`  FAIL ${n}\n     ${why}`); };
const has = (out, needle, name) => (out.includes(needle) ? ok(name) : bad(name, `expected "${needle}"`));
const hasnt = (out, needle, name) => (out.includes(needle) ? bad(name, `found "${needle}"`) : ok(name));

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${srv.address().port}`)));
const close = (srv) => new Promise((r) => srv.close(r));
const readBody = (req) => new Promise((r) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => r(s)); });

const PRICES = { WC21: { M1: 32.99, M2: 21.99 }, GC13: { M1: 29.99, M2: 21.99 } };

// blockDirect: refuse anything not sent through the stand-in ScraperAPI,
// as a WAF refuses a datacenter IP.
function pnp({ blockDirect = false } = {}) {
  const carts = new Map();
  return http.createServer(async (req, res) => {
    const json = (o, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o, null, 2)); };
    const body = await readBody(req);
    if (blockDirect && req.headers["x-via"] !== "scraperapi") {
      res.writeHead(403, { "content-type": "text/html" });
      return res.end("<html><body>Access Denied - Reference #18.abc</body></html>");
    }
    if (req.headers["x-pnp-cache-key"] !== "anonymous") return json({ errors: [{ type: "CacheKey" }] }, 400);
    const u = new URL(req.url, "http://x");
    const m = u.pathname.match(/\/users\/anonymous\/carts(?:\/([^/]+))?(\/addresses\/delivery)?$/);
    if (m && !m[1] && req.method === "POST") {
      const guid = `cart-${carts.size + 1}`;
      carts.set(guid, "WC21");
      return json({ guid, baseStore: { uid: "WC21", displayName: "Pick n Pay Constantia" } });
    }
    if (m && m[2]) {
      const a = JSON.parse(body || "{}");
      if (!a.streetname) return json({ errors: [{ type: "ValidationError", subject: "streetname" }] }, 400);
      carts.set(m[1], a.latitude === -26.1076 ? "GC13" : "WC21");
      return json(null, 201);
    }
    if (m && req.method === "GET") return json({ guid: m[1], baseStore: { uid: carts.get(m[1]), displayName: "Pick n Pay Benmore" } });
    if (u.pathname.endsWith("/products/search")) {
      const code = u.searchParams.get("storeCode") ?? "WC21";
      const prices = PRICES[code] ?? {};
      const products = Object.entries(prices).map(([c, value]) => ({
        code: c,
        name: c === "M1" ? "PnP Full Cream Fresh Milk 2L" : "Clover Fresh Milk 1L",
        price: { value, currencyIso: "ZAR", formattedValue: `R${value}` },
        images: [{ format: "product", url: `/medias/${c}.jpg` }],
        potentialPromotions: c === "M1" ? [{ code: "SS1", description: "Smart Shopper price R27.99", promotionType: "SMART_SHOPPER" }] : [],
        stock: { stockLevelStatus: "inStock" },
        available: true,
      }));
      return json({ products });
    }
    json({ errors: [{ type: "NotFound" }] }, 404);
  });
}

function scraperApi() {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const body = req.method === "GET" ? undefined : await readBody(req);
    const r = await fetch(u.searchParams.get("url"), {
      method: req.method,
      headers: { ...Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.startsWith("x-") || k === "content-type")), "x-via": "scraperapi" },
      body,
    });
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
    res.end(await r.text());
  });
}

async function run(opts, env = {}) {
  const store = pnp(opts);
  const proxy = scraperApi();
  try {
    const child = spawn(process.execPath, [PROBE], {
      env: { ...process.env, PNP_ORIGIN: await listen(store), SCRAPERAPI_URL: `${await listen(proxy)}/`, SCRAPERAPI_KEY: KEY, ...env },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    await new Promise((r) => child.on("close", r));
    return out;
  } finally {
    await close(store);
    await close(proxy);
  }
}

console.log("both ways answer");
let out = await run();
has(out, "default store WC21", "reports the cart's default store");
has(out, "Pick n Pay Benmore (GC13)", "and the store Sandton gets");
has(out, "2 products at GC13", "searches at that store");
has(out, "1 priced differently", "shows the store code changes a price");
has(out, "GC13 R29.99  WC21 R32.99", "and which, at each store");
has(out, "potentialPromotions:", "prints a product's promotions, for the parser");
has(out, "SMART_SHOPPER", "including the Smart Shopper one");
has(out, '"url":"/medias/M1.jpg"', "and its picture field");
has(out, "plain requests straight to pnp.co.za work", "verdict: no ScraperAPI needed");
hasnt(out, KEY, "never prints the key");

console.log("\nplain requests blocked");
out = await run({ blockDirect: true });
has(out, "403 FAIL <html><body>Access Denied", "shows what the block looked like");
has(out, "only through ScraperAPI", "verdict: through ScraperAPI");

console.log("\nno key");
out = await run({ blockDirect: true }, { SCRAPERAPI_KEY: "" });
has(out, "skipped: SCRAPERAPI_KEY is not set", "says it skipped ScraperAPI");
has(out, "neither way got products", "verdict: neither");

if (fail) console.log(`\n--- last output ---\n${out}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
