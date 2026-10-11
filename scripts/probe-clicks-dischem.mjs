// Can the app read Clicks (#164) and Dis-Chem (#165) prices, and what does it cost?
//
// The owner's order: plain requests first, ScraperAPI only where a store
// blocks them. Checked from a cloud session on 2026-10-11:
//
//   Clicks    clicks.co.za answers, and its search is Algolia. The app ID and
//             search-only key are in the site's own algoliaCombined.js, so the
//             catalogue is one free JSON request away, like Pick n Pay's.
//   Dis-Chem  every URL answers 403 with Cloudflare's "Just a moment..." page,
//             even to a real headless Chromium.
//
// A cloud session isn't the VPS, so this asks both again from the server:
//
//   Clicks    1. the site's JavaScript, for the Algolia app, index and key
//             2. an Algolia search per query: count, three products, every field
//   Dis-Chem  1. the search page, direct
//             2. only if Cloudflare turned that away: through ScraperAPI's
//                standard request (1 credit)
//             3. only with DISCHEM_PREMIUM=1: ScraperAPI premium (10 credits)
//             then, for whatever page arrived, the search service it names
//             (Klevu, Algolia...), which may be free to ask directly.
//
// At most MAX_CREDITS (default 3) ScraperAPI requests, each one printed.
// ScraperAPI's own account count is read first, which costs nothing.
//
// Run in the backend container and post the output to #165:
//
//   curl -fsSL -o /tmp/probe-clicks-dischem.mjs \
//     https://raw.githubusercontent.com/ethichadebe/Brittle-AI/master/scripts/probe-clicks-dischem.mjs
//   cd /opt/accucery && bash scripts/report.sh 165 -- sh -c \
//     'docker compose -f docker-compose.prod.yml exec -T backend \
//        node --input-type=module < /tmp/probe-clicks-dischem.mjs'
//
// Prints no keys: not ScraperAPI's, and not the Algolia key either, which is
// public but has no business in an issue. Every line goes through redact().
// Offline test: node scripts/probe-clicks-dischem.test.mjs

const CLICKS = process.env.CLICKS_ORIGIN || "https://clicks.co.za";
const CLICKS_JS = "/_ui/desktop/theme-blue/clicks/algoliaCombined.js";
// Algolia's host is per app; the test points every app at its stand-in.
const ALGOLIA = (app) => process.env.ALGOLIA_URL || `https://${app}-dsn.algolia.net`;
const DISCHEM = process.env.DISCHEM_ORIGIN || "https://www.dischem.co.za";
const SCRAPERAPI_URL = process.env.SCRAPERAPI_URL || "http://api.scraperapi.com/";
const SCRAPERAPI_ACCOUNT = process.env.SCRAPERAPI_ACCOUNT_URL || "https://api.scraperapi.com/account";
const KEY = process.env.SCRAPERAPI_KEY || "";
const QUERIES = (process.env.QUERIES || "toothpaste,milk").split(",").map((q) => q.trim()).filter(Boolean);
const MAX_CREDITS = Number(process.env.MAX_CREDITS ?? 3);
const PREMIUM = process.env.DISCHEM_PREMIUM === "1";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const secrets = new Set([KEY].filter(Boolean));
function redact(s) {
  let out = String(s).replace(/api_key=[^&\s"']+/gi, "api_key=REDACTED");
  for (const k of secrets) out = out.split(k).join("REDACTED");
  return out;
}
const say = (s = "") => console.log(redact(s));
const flat = (s, n = 80) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

let credits = 0;

async function get(url, { method = "GET", headers = {}, body } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: { "User-Agent": UA, "Accept-Language": "en-ZA,en;q=0.9", ...headers },
      ...(body !== undefined && { body }),
      signal: AbortSignal.timeout(90000),
    });
    return { status: res.status, text: await res.text(), cfMitigated: res.headers.get("cf-mitigated") };
  } catch (e) {
    return { status: 0, text: String(e?.cause?.code ?? e?.message ?? e), cfMitigated: null };
  }
}

// Through ScraperAPI, counting the spend. Never returns or prints the URL.
async function viaScraperApi(target, extra = "", cost = 1) {
  if (!KEY) return { skipped: "SCRAPERAPI_KEY is not set" };
  if (credits + cost > MAX_CREDITS) return { skipped: `would pass the ${MAX_CREDITS}-credit cap` };
  credits += cost;
  const url = `${SCRAPERAPI_URL}?api_key=${encodeURIComponent(KEY)}&url=${encodeURIComponent(target)}${extra}`;
  return get(url);
}

/** Cloudflare's challenge, as opposed to a real page that merely loads Cloudflare. */
function challenged(r) {
  if (r.cfMitigated === "challenge") return true;
  if (r.status === 403 || r.status === 503 || r.status === 429) return true;
  return r.text.length < 50000 && /<title>Just a moment|challenges\.cloudflare\.com\/cdn-cgi|cf-chl-|Attention Required! \| Cloudflare/i.test(r.text);
}

const title = (html) => flat(html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "-", 60);

// ---------------------------------------------------------------- ScraperAPI

async function account() {
  say("== ScraperAPI account (free to ask) ==");
  if (!KEY) return say("no SCRAPERAPI_KEY: Dis-Chem is tried direct only\n");
  const r = await get(`${SCRAPERAPI_ACCOUNT}?api_key=${encodeURIComponent(KEY)}`);
  let a = null;
  try { a = JSON.parse(r.text); } catch { /* shown below */ }
  if (r.status === 200 && a) say(`used ${a.requestCount ?? "?"} of ${a.requestLimit ?? "?"} this period`);
  else say(`HTTP ${r.status}: ${flat(r.text, 60)}`);
  say("");
}

// -------------------------------------------------------------------- Clicks

/**
 * Every (app, key) pair the bundle passes to an Algolia client. The bundle
 * also carries commented-out older keys, so each is tried rather than trusting
 * the first, and the first that searches wins.
 */
function algoliaCandidates(js) {
  const seen = new Set();
  const out = [];
  // Webpack wraps modules in eval strings, so the whitespace between the
  // arguments may be real or written out as \r\n and \t.
  const gap = String.raw`(?:\s|\\[rnt])*`;
  const re = new RegExp(String.raw`\(${gap}['"]([A-Z0-9]{10})['"]${gap},${gap}['"]([0-9a-f]{32})['"]`, "g");
  for (const m of js.matchAll(re)) {
    const id = `${m[1]}:${m[2]}`;
    if (!seen.has(id)) { seen.add(id); out.push({ app: m[1], key: m[2] }); }
  }
  return out;
}

const money = (v) => (v === undefined || v === null || v === "" ? "?" : `R${Number(v).toFixed(2)}`);

async function clicks() {
  say("== Clicks (#164) ==");
  const home = await get(`${CLICKS}/`);
  say(`home:     HTTP ${home.status}  ${home.text.length}B  ${challenged(home) ? "BLOCKED" : "ok"}`);
  const index = home.text.match(/value="([^"]+)"\s+id="algoliaProductIndex"/)?.[1] || "Prod_ProductIndex";
  say(`index:    ${index}${home.text.includes("algoliaProductIndex") ? "" : " (default; not named on the page)"}`);

  const js = await get(`${CLICKS}${CLICKS_JS}`);
  const found = js.status === 200 ? algoliaCandidates(js.text) : [];
  for (const c of found) secrets.add(c.key);
  say(`script:   HTTP ${js.status}  ${js.text.length}B  ${found.length} Algolia key(s) in it`);
  if (!found.length) {
    say("verdict:  no Algolia key found; the bundle has moved or changed shape\n");
    return { works: false };
  }

  let live = null;
  let works = false;
  for (const q of QUERIES) {
    const tries = live ? [live] : found;
    let r = null;
    for (const c of tries) {
      r = await get(`${ALGOLIA(c.app)}/1/indexes/${encodeURIComponent(index)}/query`, {
        method: "POST",
        headers: { "X-Algolia-Application-Id": c.app, "X-Algolia-API-Key": c.key, "Content-Type": "application/json" },
        body: JSON.stringify({ params: `query=${encodeURIComponent(q)}&hitsPerPage=20` }),
      });
      if (r.status === 200) {
        if (!live) say(`key:      #${found.indexOf(c) + 1} of ${found.length} works (app ${c.app})`);
        live = c;
        break;
      }
    }
    let d = null;
    try { d = JSON.parse(r.text); } catch { /* shown below */ }
    if (r.status !== 200 || !d?.hits) {
      say(`"${q}": HTTP ${r.status} ${flat(r.text, 60)}`);
      continue;
    }
    works ||= d.hits.length > 0;
    say(`"${q}": ${d.nbHits} matches, ${d.hits.length} returned`);
    for (const h of d.hits.slice(0, 3)) {
      const promo = h.promoWithAppliedGrossPriceValue && String(h.promoWithAppliedGrossPriceValue) !== String(h.price)
        ? ` promo ${money(h.promoWithAppliedGrossPriceValue)}` : "";
      say(`  ${flat(`${h.brandName ?? ""} ${h.productName ?? ""}`, 44).padEnd(44)} ${money(h.price)}${promo}${h.inStockFlag === false || h.inStockFlag === "False" ? " (out)" : ""}`);
      if (h.promoDescriptions?.length) say(`    promo: ${flat(h.promoDescriptions[0], 90)}`);
    }
    // Every field across all hits, not just the first: promo fields exist only
    // on promoted products, and reading hit zero has hidden exactly that before.
    const keys = [...new Set(d.hits.flatMap((h) => Object.keys(h)))].sort();
    say(`  fields: ${keys.join(",")}`);
    const differs = d.hits.filter((h) => h.promoWithAppliedGrossPriceValue && String(h.promoWithAppliedGrossPriceValue) !== String(h.price));
    say(`  promo price differs from price on ${differs.length} of ${d.hits.length}`);
    const img = d.hits.find((h) => h.img300Wx300H)?.img300Wx300H;
    if (img) say(`  image: ${flat(img, 70)}`);
  }
  say(`verdict:  ${works ? "Clicks works direct, 0 credits" : "Clicks returned no products (see above)"}\n`);
  return { works };
}

// ------------------------------------------------------------------ Dis-Chem

const PLATFORMS = [
  ["klevu", "klevu"], ["algolia", "algolia"], ["cnstrc", "constructor"], ["searchspring", "searchspring"],
  ["unbxd", "unbxd"], ["bloomreach", "bloomreach"], ["doofinder", "doofinder"], ["typesense", "typesense"],
  ["searchanise", "searchanise"], ["magento", "magento"], ["graphql", "graphql"], ["__NEXT_DATA__", "next.js"],
  ["__NUXT__", "nuxt"], ["shopify", "shopify"],
];

function fingerprint(html) {
  const named = PLATFORMS.filter(([needle]) => html.toLowerCase().includes(needle.toLowerCase())).map(([, n]) => n);
  say(`  platforms named: ${named.join(", ") || "none recognised"}`);
  const hosts = [...new Set([...html.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]))]
    .filter((h) => !/dischem\.co\.za$/i.test(h)).sort();
  say(`  other hosts: ${hosts.slice(0, 14).join(" ") || "none"}`);
  const prices = [...html.matchAll(/R\s?(\d{1,5}[.,]\d{2})\b/g)].length;
  const ld = [...html.matchAll(/"@type"\s*:\s*"Product"/g)].length;
  say(`  rand prices in page: ${prices}, JSON-LD products: ${ld}`);
  return named;
}

async function dischem() {
  say("== Dis-Chem (#165) ==");
  const target = `${DISCHEM}/catalogsearch/result/?q=${encodeURIComponent(QUERIES[0])}`;
  const tries = [
    { how: "direct", run: () => get(target), cost: 0 },
    { how: "ScraperAPI standard, 1 credit", run: () => viaScraperApi(target), cost: 1 },
    ...(PREMIUM ? [{ how: "ScraperAPI premium, 10 credits", run: () => viaScraperApi(target, "&premium=true", 10), cost: 10 }] : []),
  ];
  for (const t of tries) {
    const r = await t.run();
    if (r.skipped) { say(`${t.how}: skipped, ${r.skipped}`); continue; }
    const blocked = challenged(r);
    say(`${t.how}: HTTP ${r.status}  ${r.text.length}B  "${title(r.text)}"  ${blocked ? "BLOCKED by Cloudflare" : "page arrived"}`);
    if (!blocked && r.status === 200) {
      const named = fingerprint(r.text);
      const free = named.filter((n) => ["klevu", "algolia", "constructor", "searchspring", "unbxd", "bloomreach", "doofinder", "typesense", "searchanise"].includes(n));
      say(`verdict:  Dis-Chem answers ${t.how === "direct" ? "direct, 0 credits" : `only through ${t.how}`}${free.length ? `; it names ${free.join(", ")}: ask that directly next, maybe free` : ""}\n`);
      return { works: true, how: t.how };
    }
  }
  if (!PREMIUM && KEY) say("premium (10 credits a search) not tried: rerun with DISCHEM_PREMIUM=1 MAX_CREDITS=11 to see");
  say("verdict:  Dis-Chem blocked every way tried\n");
  return { works: false };
}

say(`Clicks and Dis-Chem probe, queries: ${QUERIES.join(", ")}\n`);
await account();
await clicks();
await dischem();
say(`ScraperAPI credits spent by this run: ${credits} (cap ${MAX_CREDITS})`);
