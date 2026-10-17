// Offline test for scripts/probe-dischem-klevu.mjs. No network, no stores.
//
//   node scripts/probe-dischem-klevu.test.mjs
//
// Stand-ins for ScraperAPI (its account count, and the Dis-Chem page, only
// through premium), Klevu (which answers only the live key, on v2 or v1), and
// a picture host (open, or behind Cloudflare). The page's shape is Magento
// with Klevu's settings in escaped JSON; the products and prices are invented.
// Whether the real Klevu answers the VPS is what the live run is for.

import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)), "probe-dischem-klevu.mjs");
const KEY = "test-scraperapi-key-7c1d";
const KLEVU_KEY = "klevu-161234567890123456"; // gitleaks:allow — invented test value, not a real key
const OTHER_KEY = "klevu-169999999999999999"; // gitleaks:allow — invented test value, not a real key
const HOST = "eucs99v2.ksearchnet.com";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ok   ${n}`); };
const bad = (n, why) => { fail++; console.log(`  FAIL ${n}\n     ${why}`); };
const has = (out, needle, name) => (out.includes(needle) ? ok(name) : bad(name, `expected "${needle}"`));
const hasnt = (out, needle, name) => (out.includes(needle) ? bad(name, `found "${needle}"`) : ok(name));

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${srv.address().port}`)));
const close = (srv) => new Promise((r) => srv.close(r));
const readBody = (req) => new Promise((r) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => r(s)); });

// A Magento page: Klevu's settings as escaped JSON, an older key in a
// comment ahead of the live one, and class names that also start "klevu-".
const page = (keys) => `<html><head><title>Search results for: 'toothpaste' | Dis-Chem</title></head><body>
<div class="klevu-search-results klevu-fluid"></div>
<!-- old: ${keys[0]} -->
<script type="text/x-magento-init">{"*":{"Klevu_Search/js/klevu":{"url":{"protocol":"https:","search":"https:\\/\\/${HOST}\\/cs\\/v2\\/search"},"search":{"apiKey":"${keys[1] ?? keys[0]}"}}}}</script>
<span>R39.99</span></body></html>`;

function scraperApi({ used = 10, limit = 1000, html = page([OTHER_KEY, KLEVU_KEY]) } = {}, seen) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.searchParams.get("api_key") !== KEY) { res.writeHead(401); return res.end("bad key"); }
    if (u.pathname === "/account") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ requestCount: used, requestLimit: limit }));
    }
    seen.push(u.searchParams.get("premium") === "true" ? "premium" : "standard");
    if (u.searchParams.get("premium") !== "true") {
      res.writeHead(500); return res.end("Request failed. You will not be charged for this request.");
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  });
}

const RECORDS = (img) => [
  { name: "Colgate Toothpaste 100ml", price: "49.99", salePrice: "39.99", currency: "ZAR", imageUrl: `${img}/media/colgate.jpg`, inStock: "yes", sku: "123" },
  { name: "Aquafresh Twin Pack", price: "44.99", salePrice: "44.99", currency: "ZAR", inStock: "no", url: "https://www.dischem.co.za/aquafresh" },
];

// Its errors repeat the key they were sent, as an API may: the probe has to
// redact it anyway.
function klevu({ v2 = true, v1 = true, img }, seen) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    res.setHeader("content-type", "application/json");
    if (u.pathname === "/cs/v2/search") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const key = body.context?.apiKeys?.[0];
      seen.push(`v2:${key === KLEVU_KEY ? "live" : "other"}`);
      if (!v2 || key !== KLEVU_KEY) { res.writeHead(400); return res.end(`{"error":"invalid key ${key}"}`); }
      return res.end(JSON.stringify({ queryResults: [{ id: "productSearch", meta: { totalResultsFound: 87 }, records: RECORDS(img) }] }));
    }
    if (u.pathname === "/cloud-search/n-search/search") {
      const key = u.searchParams.get("ticket");
      seen.push(`v1:${key === KLEVU_KEY ? "live" : "other"}`);
      if (!v1 || key !== KLEVU_KEY) { res.writeHead(400); return res.end(`{"error":"invalid ticket ${key}"}`); }
      return res.end(JSON.stringify({ meta: { totalResultsFound: 87 }, result: RECORDS(img) }));
    }
    res.writeHead(404); res.end("{}");
  });
}

function pictures({ blocked = false } = {}) {
  return http.createServer((req, res) => {
    if (blocked) { res.writeHead(403, { "content-type": "text/html" }); return res.end("<title>Just a moment...</title>"); }
    res.writeHead(200, { "content-type": "image/jpeg" });
    res.end(Buffer.alloc(2048));
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

async function scenario(name, { api = {}, kl = {}, pic = {}, env = {} }, checks) {
  console.log(`\n${name}`);
  const seenApi = [], seenKlevu = [];
  const img = pictures(pic);
  const imgUrl = await listen(img);
  const a = scraperApi(api, seenApi);
  const k = klevu({ ...kl, img: imgUrl }, seenKlevu);
  const apiUrl = await listen(a);
  const klevuUrl = await listen(k);
  const { out, code } = await run({
    SCRAPERAPI_KEY: KEY,
    SCRAPERAPI_URL: `${apiUrl}/`,
    SCRAPERAPI_ACCOUNT_URL: `${apiUrl}/account`,
    KLEVU_URL: klevuUrl,
    DISCHEM_ORIGIN: "https://www.dischem.co.za",
    QUERIES: "toothpaste,milk",
    ...env,
  });
  await Promise.all([close(a), close(k), close(img)]);
  if (code === 0) ok("exits cleanly");
  else bad("exits cleanly", `exit ${code}\n${out}`);
  // Neither key may reach the public issue, whatever else happens.
  hasnt(out, KEY, "never prints the ScraperAPI key");
  hasnt(out, KLEVU_KEY, "never prints the Klevu key");
  hasnt(out, OTHER_KEY, "never prints the older Klevu key");
  checks(out, { seenApi, seenKlevu });
  if (process.env.SHOW) console.log(out);
}

await scenario("Klevu answers on v2, pictures are open", {}, (out, { seenApi, seenKlevu }) => {
  has(out, `search hosts: ${HOST}`, "reads the search host from the escaped JSON");
  has(out, "search keys:  2 (not printed)", "finds both keys, and no class names");
  has(out, "Colgate Toothpaste 100ml", "shows products");
  has(out, "R49.99 sale R39.99", "shows a sale price");
  has(out, "(out)", "marks a product out of stock");
  has(out, "currency,imageUrl,inStock,name,price,salePrice,sku,url", "lists the fields of every record, not just the first");
  has(out, "sale price differs from price on 1 of 2", "counts real sales only");
  has(out, `Klevu answers direct from here, 0 credits a search (${HOST})`, "verdict: free");
  has(out, "key:      #2 of 2 works", "says which key worked");
  has(out, "a picture", "pictures load directly");
  has(out, "ScraperAPI credits spent by this run: 10 (cap 10)", "spends exactly one premium request");
  (seenApi.join() === "premium" ? ok : (n) => bad(n, seenApi.join()))("asks ScraperAPI once, through premium");
  (seenKlevu.filter((s) => s.endsWith("live")).length === 2 ? ok : (n) => bad(n, seenKlevu.join()))("uses the live key for both queries");
});

await scenario("only Klevu's older API answers", { kl: { v2: false } }, (out) => {
  has(out, "v1 " + HOST, "falls back to n-search");
  has(out, "Klevu answers direct from here", "verdict: free");
});

await scenario("Klevu answers nothing", { kl: { v2: false, v1: false } }, (out) => {
  has(out, "Klevu didn't answer with products", "says so");
  has(out, "no picture URL", "doesn't look for a picture");
});

await scenario("pictures are behind Cloudflare", { pic: { blocked: true } }, (out) => {
  has(out, "BLOCKED by Cloudflare", "says the pictures need the proxy");
});

await scenario("fewer than 10 credits left", { api: { used: 995 } }, (out, { seenApi }) => {
  has(out, "skipped: 5 credits left, and premium costs 10", "says why it didn't fetch");
  has(out, "ScraperAPI credits spent by this run: 0", "spends nothing");
  (seenApi.length === 0 ? ok : (n) => bad(n, seenApi.join()))("never asks ScraperAPI for the page");
});

await scenario("a cap below 10", { env: { MAX_CREDITS: "3" } }, (out, { seenApi }) => {
  has(out, "would pass the 3-credit cap", "keeps to the cap");
  (seenApi.length === 0 ? ok : (n) => bad(n, seenApi.join()))("never asks ScraperAPI for the page");
});

await scenario("a page without Klevu", { api: { html: "<html><title>Dis-Chem</title><div class='klevu-x'></div></html>" } }, (out) => {
  has(out, "search hosts: none", "finds no host");
  has(out, "no Klevu host in the page", "verdict says why");
});

await scenario("a key in an unexpected shape stays out of the snippet", {
  api: { html: `<script>{"url":{"search":"https:\\/\\/${HOST}\\/cs"},"token":"zzTOKENzz0123456789abcdefXYZ"}</script>` },
}, (out) => {
  hasnt(out, "zzTOKENzz0123456789abcdefXYZ", "masks long tokens near the host");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
