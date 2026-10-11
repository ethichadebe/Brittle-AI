// Offline test for scripts/probe-clicks-dischem.mjs. No network, no stores.
//
//   node scripts/probe-clicks-dischem.test.mjs
//
// Stand-ins for clicks.co.za (a bundle holding an old, commented-out Algolia
// key ahead of the live one, as the real one does), Algolia (which accepts
// only the live key), Dis-Chem (Cloudflare's challenge unless the request came
// through ScraperAPI, or always), and ScraperAPI. The shapes are the ones seen
// on 2026-10-11; the products and prices are invented. Whether the real sites
// answer the VPS is what the live run is for.

import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)), "probe-clicks-dischem.mjs");
const KEY = "test-scraperapi-key-5e2a";
const OLD_ALGOLIA = "0123456789abcdef0123456789abcdef"; // gitleaks:allow — invented test value, not a real key
const LIVE_ALGOLIA = "fedcba9876543210fedcba9876543210"; // gitleaks:allow — invented test value, not a real key
const APP = "TESTAPP123";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ok   ${n}`); };
const bad = (n, why) => { fail++; console.log(`  FAIL ${n}\n     ${why}`); };
const has = (out, needle, name) => (out.includes(needle) ? ok(name) : bad(name, `expected "${needle}"`));
const hasnt = (out, needle, name) => (out.includes(needle) ? bad(name, `found "${needle}"`) : ok(name));
const check = (cond, name, why) => (cond ? ok(name) : bad(name, why()));

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${srv.address().port}`)));
const close = (srv) => new Promise((r) => srv.close(r));
const readBody = (req) => new Promise((r) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => r(s)); });

// The bundle as webpack ships it: modules inside eval strings, line breaks
// written out as \r\n, and the retired key still there in a comment.
const BUNDLE = String.raw`eval("\r\n//const client = algoliasearchNew('${APP}', '${OLD_ALGOLIA}');\r\nconst algoliaClient = algoliasearch_lite__WEBPACK_IMPORTED_MODULE_0___default()(\r\n\t\t  '${APP}',\r\n\t\t  '${LIVE_ALGOLIA}'\r\n);");`;

function clicks() {
  return http.createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end('<html><input type="hidden" value="Test_ProductIndex" id="algoliaProductIndex"></html>');
    }
    if (req.url.endsWith("/algoliaCombined.js")) {
      res.writeHead(200, { "content-type": "application/javascript" });
      return res.end(BUNDLE);
    }
    res.writeHead(404); res.end();
  });
}

const HITS = [
  { brandName: "Colgate", productName: "Toothpaste 100ml", price: 49.99, promoWithAppliedGrossPriceValue: 39.99,
    promoDescriptions: ["Save 20% on selected. ClubCard customers instantly get 10% off."], img300Wx300H: "/medias/colgate.jpg?context=abc", inStockFlag: true },
  { brandName: "Aquafresh", productName: "Twin Pack", price: "44.99", inStockFlag: true, onlyAtClicksFlag: true },
];

function algolia(seen) {
  return http.createServer(async (req, res) => {
    const body = JSON.parse((await readBody(req)) || "{}");
    seen.push({ url: req.url, key: req.headers["x-algolia-api-key"], app: req.headers["x-algolia-application-id"], params: body.params });
    if (req.headers["x-algolia-api-key"] !== LIVE_ALGOLIA || req.headers["x-algolia-application-id"] !== APP) {
      res.writeHead(403, { "content-type": "application/json" });
      return res.end('{"message":"Invalid Application-ID or API key","status":403}');
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ hits: HITS, nbHits: 182 }));
  });
}

const CHALLENGE = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x.js"></script></body></html>';
const PAGE = '<html><head><title>Search results for milk | Dis-Chem</title><script src="https://js.klevu.com/core/v2/klevu.js"></script></head><body>Magento <span>R 21.99</span><span>R32.50</span></body></html>';

// mode: "blockDirect" passes only what came through ScraperAPI; "blockAll" never passes.
function dischem(mode) {
  return http.createServer((req, res) => {
    const passes = mode === "blockDirect" && req.headers["x-via"] === "scraperapi";
    if (!passes) {
      res.writeHead(403, { "content-type": "text/html", "cf-mitigated": "challenge" });
      return res.end(CHALLENGE);
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(PAGE);
  });
}

function scraperapi(calls) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.searchParams.get("api_key") !== KEY) { res.writeHead(401); return res.end("bad key"); }
    if (u.pathname === "/account") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"requestCount":120,"requestLimit":1000}');
    }
    calls.push({ premium: u.searchParams.get("premium") === "true" });
    const r = await fetch(u.searchParams.get("url"), { headers: { "x-via": "scraperapi" } });
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "text/html" });
    res.end(await r.text());
  });
}

function run(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PROBE], { env: { PATH: process.env.PATH, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ out, code }));
  });
}

async function scenario(name, { dischemMode = "blockDirect", key = KEY, extra = {} } = {}, expectations) {
  console.log(name);
  const seen = [];
  const calls = [];
  const servers = [clicks(), algolia(seen), dischem(dischemMode), scraperapi(calls)];
  const [c, a, d, s] = await Promise.all(servers.map(listen));
  const { out, code } = await run({
    CLICKS_ORIGIN: c, ALGOLIA_URL: a, DISCHEM_ORIGIN: d,
    SCRAPERAPI_URL: `${s}/`, SCRAPERAPI_ACCOUNT_URL: `${s}/account`,
    ...(key && { SCRAPERAPI_KEY: key }), QUERIES: "toothpaste,milk", ...extra,
  });
  await Promise.all(servers.map(close));
  if (code !== 0) bad(`${name}: exits 0`, `exit ${code}\n${out}`);
  expectations(out, { seen, calls });
  // Whatever happened, no key of any kind reaches the output.
  for (const k of [KEY, OLD_ALGOLIA, LIVE_ALGOLIA]) hasnt(out, k, `never prints a key (${k.slice(0, 8)}…)`);
  console.log("");
}

await scenario("Dis-Chem blocks only direct requests", {}, (out, { seen, calls }) => {
  has(out, "used 120 of 1000", "reads ScraperAPI's own count first");
  has(out, "index:    Test_ProductIndex", "reads the index name from the page");
  has(out, "2 Algolia key(s)", "finds both keys, the commented one too");
  has(out, "key:      #2 of 2 works", "moves past the retired key to the live one");
  check(seen.filter((x) => x.key === LIVE_ALGOLIA).length === 2, "asks with the live key once per query", () => JSON.stringify(seen));
  check(seen.filter((x) => x.key === OLD_ALGOLIA).length === 1, "does not retry the retired key on the second query", () => JSON.stringify(seen));
  check(seen.every((x) => x.url === "/1/indexes/Test_ProductIndex/query"), "queries the index it found", () => seen.map((x) => x.url).join(" "));
  has(out, '"toothpaste": 182 matches, 2 returned', "counts the matches");
  has(out, "R49.99 promo R39.99", "shows price and promo price");
  has(out, "R44.99", "reads a price sent as a string");
  has(out, "promo: Save 20% on selected", "shows the promo wording");
  has(out, "fields: brandName,img300Wx300H,inStockFlag,onlyAtClicksFlag,price", "lists fields from every hit, not just the first");
  has(out, "Clicks works direct, 0 credits", "Clicks verdict");
  has(out, 'direct: HTTP 403', "tries Dis-Chem direct first");
  has(out, "BLOCKED by Cloudflare", "names Cloudflare's challenge");
  has(out, "ScraperAPI standard, 1 credit: HTTP 200", "then ScraperAPI");
  has(out, "platforms named: klevu, magento", "names the search service the page loads");
  has(out, "js.klevu.com", "lists the outside hosts");
  has(out, "rand prices in page: 2", "counts prices in the page");
  has(out, "it names klevu: ask that directly next", "points at the free route");
  check(calls.length === 1 && !calls[0].premium, "spends exactly one standard credit", () => JSON.stringify(calls));
  has(out, "credits spent by this run: 1 (cap 3)", "reports the spend");
});

await scenario("Dis-Chem blocks ScraperAPI too", { dischemMode: "blockAll" }, (out, { calls }) => {
  has(out, "ScraperAPI standard, 1 credit: HTTP 403", "tries the standard request");
  hasnt(out, "premium, 10 credits:", "does not try premium unless asked");
  has(out, "rerun with DISCHEM_PREMIUM=1", "says how to try premium");
  has(out, "Dis-Chem blocked every way tried", "verdict");
  check(calls.length === 1, "one credit, no more", () => JSON.stringify(calls));
});

await scenario("premium asked for, within the cap", { dischemMode: "blockAll", extra: { DISCHEM_PREMIUM: "1", MAX_CREDITS: "11" } }, (out, { calls }) => {
  has(out, "ScraperAPI premium, 10 credits: HTTP 403", "tries premium");
  check(calls.filter((c) => c.premium).length === 1, "sends premium=true once", () => JSON.stringify(calls));
  has(out, "credits spent by this run: 11 (cap 11)", "counts premium as 10");
});

await scenario("premium asked for, past the cap", { dischemMode: "blockAll", extra: { DISCHEM_PREMIUM: "1" } }, (out, { calls }) => {
  has(out, "premium, 10 credits: skipped, would pass the 3-credit cap", "refuses to pass the cap");
  check(calls.every((c) => !c.premium), "never sends premium", () => JSON.stringify(calls));
});

await scenario("no ScraperAPI key", { key: "" }, (out, { calls }) => {
  has(out, "no SCRAPERAPI_KEY", "says so up front");
  has(out, "skipped, SCRAPERAPI_KEY is not set", "skips the paid step");
  has(out, "Clicks works direct", "Clicks needs no key");
  check(calls.length === 0, "no ScraperAPI calls", () => JSON.stringify(calls));
});

await scenario("cap of zero", { extra: { MAX_CREDITS: "0" } }, (out, { calls }) => {
  has(out, "skipped, would pass the 0-credit cap", "MAX_CREDITS=0 spends nothing");
  check(calls.length === 0, "no ScraperAPI calls", () => JSON.stringify(calls));
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
