// Can the app read Dis-Chem's prices from Klevu, its search service, for free (#165)?
//
// What the last probe found (2026-10-17, from the VPS):
//
//   direct                      403, Cloudflare's "Just a moment..."
//   ScraperAPI standard         500, "Request failed" (not charged)
//   ScraperAPI premium (10 cr.) 200, the search page, naming Klevu and Magento
//
// 10 credits a search would empty the free plan in 100 searches. But Klevu
// answers on its own servers (*.ksearchnet.com), outside Dis-Chem's Cloudflare,
// the way Clicks' Algolia does. So this:
//
//   1. fetches the search page once through premium (10 credits), for the
//      Klevu search host and the shop's public search key written into it
//   2. asks Klevu directly, both of its search APIs, per query: free
//   3. fetches one product image directly, to see whether pictures are
//      behind Cloudflare too (they'd need the image proxy to get past it)
//
// The second run (2026-10-17) found a key in the page but no search host:
// Klevu's settings come from its own scripts instead. So when the page names
// no host, this also reads the Klevu scripts the page loads (free), and as a
// last resort tries Klevu's numbered EU hosts (eucs1v2 ... eucs45v2) with the
// key, stopping at the first that answers. Each of those is free.
//
// The page is saved to PAGE_FILE (default /tmp/dischem-search.html, inside the
// container) and read from there next time, so only the first run pays.
//
// At most MAX_CREDITS (default 10) ScraperAPI credits; the account count is
// read first, which costs nothing.
//
// Run in the backend container and post the output to #165:
//
//   curl -fsSL -o /tmp/probe-dischem-klevu.mjs \
//     https://raw.githubusercontent.com/ethichadebe/Brittle-AI/master/scripts/probe-dischem-klevu.mjs
//   cd /opt/accucery && bash scripts/report.sh 165 -- sh -c \
//     'docker compose -f docker-compose.prod.yml exec -T backend \
//        node --input-type=module < /tmp/probe-dischem-klevu.mjs'
//
// Prints no keys: not ScraperAPI's, and not Klevu's either, which is public
// but has no business in an issue. Every line goes through redact().
// Offline test: node scripts/probe-dischem-klevu.test.mjs

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DISCHEM = process.env.DISCHEM_ORIGIN || "https://www.dischem.co.za";
const SCRAPERAPI_URL = process.env.SCRAPERAPI_URL || "http://api.scraperapi.com/";
const SCRAPERAPI_ACCOUNT = process.env.SCRAPERAPI_ACCOUNT_URL || "https://api.scraperapi.com/account";
// The test points every Klevu host at its stand-in.
const KLEVU = (host) => process.env.KLEVU_URL || `https://${host}`;
const KEY = process.env.SCRAPERAPI_KEY || "";
const QUERIES = (process.env.QUERIES || "toothpaste,milk").split(",").map((q) => q.trim()).filter(Boolean);
const MAX_CREDITS = Number(process.env.MAX_CREDITS ?? 10);
const PAGE_FILE = process.env.PAGE_FILE || "/tmp/dischem-search.html";
// Klevu's EU search hosts are numbered; the guess stops at the first that answers.
const GUESS_HOSTS = Array.from({ length: 45 }, (_, i) => `eucs${i + 1}v2.ksearchnet.com`);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const secrets = new Set([KEY].filter(Boolean));
function redact(s) {
  let out = String(s).replace(/api_key=[^&\s"']+/gi, "api_key=REDACTED").replace(/ticket=[^&\s"']+/gi, "ticket=REDACTED");
  for (const k of secrets) out = out.split(k).join("REDACTED");
  return out;
}
const say = (s = "") => console.log(redact(s));
const flat = (s, n = 80) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const money = (v) => (v === undefined || v === null || v === "" ? "-" : `R${v}`);

let credits = 0;

async function get(url, { method = "GET", headers = {}, body } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: { "User-Agent": UA, "Accept-Language": "en-ZA,en;q=0.9", ...headers },
      ...(body !== undefined && { body }),
      signal: AbortSignal.timeout(90000),
    });
    return { status: res.status, text: await res.text(), type: res.headers.get("content-type") ?? "", cfMitigated: res.headers.get("cf-mitigated") };
  } catch (e) {
    return { status: 0, text: String(e?.cause?.code ?? e?.message ?? e), type: "", cfMitigated: null };
  }
}

/** Cloudflare's challenge, as opposed to a real page that merely loads Cloudflare. */
function challenged(r) {
  if (r.cfMitigated === "challenge") return true;
  if (r.status === 403 || r.status === 503 || r.status === 429) return true;
  return r.text.length < 50000 && /<title>Just a moment|challenges\.cloudflare\.com\/cdn-cgi|cf-chl-/i.test(r.text);
}

// ---------------------------------------------------------------- ScraperAPI

/** Credits left this period, or null when the account can't be read. */
async function account() {
  say("== ScraperAPI account (free to ask) ==");
  if (!KEY) {
    say("no SCRAPERAPI_KEY: the page can't be fetched\n");
    return 0;
  }
  const r = await get(`${SCRAPERAPI_ACCOUNT}?api_key=${encodeURIComponent(KEY)}`);
  let a = null;
  try { a = JSON.parse(r.text); } catch { /* shown below */ }
  if (r.status !== 200 || !a) {
    say(`HTTP ${r.status}: ${flat(r.text, 60)}\n`);
    return null;
  }
  say(`used ${a.requestCount ?? "?"} of ${a.requestLimit ?? "?"} this period\n`);
  return Number(a.requestLimit) - Number(a.requestCount);
}

// ------------------------------------------------------------- Klevu config

// Any long token is masked in what's shown of the page, in case a key comes
// in a shape the patterns below don't recognise.
const mask = (s) => String(s).replace(/[A-Za-z0-9_-]{16,}/g, "…");
const KLEVU_HOST = /([a-z0-9-]+\.(?:ksearchnet\.com|klevu\.com))/gi;

/** Klevu search hosts in some text: ksearchnet.com, or klevu.com but not its script CDN. */
function searchHosts(text) {
  return [...new Set([...text.replace(/\\\//g, "/").matchAll(KLEVU_HOST)].map((m) => m[1].toLowerCase()))]
    .filter((h) => h.endsWith("ksearchnet.com") || /cs\d*v\d/.test(h));
}

/**
 * What the page says about Klevu: search hosts, public search keys (and what
 * each sits next to), every mention of Klevu, and the scripts it loads. The
 * page's JSON escapes slashes (\/), and class names like "klevu-search" also
 * start with "klevu-", so a Klevu key is "klevu-" and digits only.
 */
function klevuConfig(html) {
  const text = html.replace(/\\\//g, "/");
  const found = [
    ...[...text.matchAll(/\bklevu-\d{8,}\b/g)].map((m) => ({ key: m[0], at: m.index, kind: "klevu-style" })),
    ...[...text.matchAll(/apiKey["']?\s*[:=]\s*["']([^"'\s]{6,})["']/gi)].map((m) => ({ key: m[1], at: m.index, kind: "an apiKey field" })),
  ];
  const keys = [...new Set(found.map((f) => f.key))];
  const keyNotes = keys.map((k) => {
    const f = found.find((x) => x.key === k);
    return `${f.kind}, after: ${flat(mask(text.slice(Math.max(0, f.at - 70), f.at)), 70)}`;
  });
  const mentions = [];
  for (const m of text.matchAll(/klevu/gi)) {
    if (mentions.length >= 15) break;
    const snippet = flat(mask(text.slice(Math.max(0, m.index - 90), m.index + 110)), 200);
    if (!mentions.some((x) => x.includes(snippet.slice(60, 140)))) mentions.push(snippet);
  }
  const scripts = [...new Set([...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]))];
  return { hosts: searchHosts(text), keys, keyNotes, mentions, scripts };
}

// --------------------------------------------------------------------- Klevu

/** Klevu's current API: POST /cs/v2/search with the key in the body. */
async function searchV2(host, key, q) {
  const r = await get(`${KLEVU(host)}/cs/v2/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: { apiKeys: [key] },
      recordQueries: [
        { id: "productSearch", typeOfRequest: "SEARCH", settings: { query: { term: q }, typeOfRecords: ["KLEVU_PRODUCT"], limit: 20, offset: 0 } },
      ],
    }),
  });
  let d = null;
  try { d = JSON.parse(r.text); } catch { /* shown by the caller */ }
  const result = d?.queryResults?.[0];
  return { r, total: result?.meta?.totalResultsFound, records: Array.isArray(result?.records) ? result.records : null };
}

/** Klevu's older API: GET n-search with the key as the "ticket". */
async function searchV1(host, key, q) {
  const params = new URLSearchParams({
    ticket: key, term: q, paginationStartsFrom: "0", noOfResults: "20",
    responseType: "json", enableFilters: "false", showOutOfStockProducts: "true",
  });
  const r = await get(`${KLEVU(host)}/cloud-search/n-search/search?${params}`);
  let d = null;
  try { d = JSON.parse(r.text); } catch { /* shown by the caller */ }
  return { r, total: d?.meta?.totalResultsFound, records: Array.isArray(d?.result) ? d.result : null };
}

function show(q, how, { r, total, records }) {
  if (!records) {
    say(`"${q}" ${how}: HTTP ${r.status} ${flat(r.text, 70)}`);
    return null;
  }
  say(`"${q}" ${how}: HTTP ${r.status}, ${total ?? "?"} matches, ${records.length} returned`);
  for (const p of records.slice(0, 3)) {
    const sale = p.salePrice !== undefined && String(p.salePrice) !== String(p.price) ? ` sale ${money(p.salePrice)}` : "";
    const stock = p.inStock === "no" || p.inStock === false ? " (out)" : "";
    say(`  ${flat(p.name, 44).padEnd(44)} ${money(p.price)}${sale}${stock}`);
  }
  // Every field across all records, not just the first: sale fields exist only
  // on products on promotion.
  say(`  fields: ${[...new Set(records.flatMap((p) => Object.keys(p)))].sort().join(",")}`);
  const onSale = records.filter((p) => p.salePrice !== undefined && String(p.salePrice) !== String(p.price));
  say(`  sale price differs from price on ${onSale.length} of ${records.length}`);
  return records;
}

/** Klevu's search host from the Klevu scripts the page loads, which are free to fetch. */
async function hostsFromScripts(scripts) {
  const klevuScripts = scripts.filter((src) => /klevu|ksearchnet/i.test(src)).slice(0, 8);
  say("== Klevu's scripts, direct (free) ==");
  if (!klevuScripts.length) {
    say("the page loads no Klevu script by name\n");
    return [];
  }
  const hosts = new Set();
  for (const src of klevuScripts) {
    const url = src.startsWith("//") ? `https:${src}` : src.startsWith("/") ? `${DISCHEM}${src}` : src;
    const r = await get(url);
    const found = r.status === 200 ? searchHosts(r.text) : [];
    found.forEach((h) => hosts.add(h));
    say(`${flat(url.replace(/[?#].*/, ""), 90)}: HTTP ${r.status} ${r.text.length}B${challenged(r) ? " BLOCKED by Cloudflare" : ""}${found.length ? `, names ${found.join(" ")}` : ""}`);
  }
  say("");
  return [...hosts];
}

/** Last resort: Klevu's numbered EU hosts, first that answers a search with the key. */
async function guessHost(keys) {
  say(`== Guessing Klevu's host: ${GUESS_HOSTS[0]} ... ${GUESS_HOSTS.at(-1)} (free) ==`);
  for (const host of GUESS_HOSTS) {
    for (const key of keys) {
      const { records } = await searchV2(host, key, QUERIES[0]);
      if (records?.length) {
        say(`${host} answers\n`);
        return [host];
      }
    }
  }
  say("none answered\n");
  return [];
}

async function klevu(config) {
  if (!config.keys.length) {
    say("== Klevu, asked directly (free) ==");
    say("verdict:  no Klevu key in the page; Klevu may be loaded another way\n");
    return { works: false };
  }
  if (!config.hosts.length) config.hosts = await hostsFromScripts(config.scripts);
  if (!config.hosts.length) config.hosts = await guessHost(config.keys);
  say("== Klevu, asked directly (free) ==");
  if (!config.hosts.length) {
    say("verdict:  no Klevu host found in the page, its scripts, or by guessing\n");
    return { works: false };
  }
  let image = null;
  let works = false;
  let live = null;
  for (const q of QUERIES) {
    const tries = live ? [live] : config.hosts.flatMap((host) => config.keys.map((key) => ({ host, key })));
    let found = null;
    for (const t of tries) {
      for (const [how, search] of [["v2", searchV2], ["v1", searchV1]]) {
        const records = show(q, `${how} ${t.host}`, await search(t.host, t.key, q));
        if (records?.length) {
          found = records;
          live = t;
          break;
        }
      }
      if (found) break;
    }
    if (found) {
      works = true;
      image ??= found.map((p) => p.imageUrl || p.image).find(Boolean) ?? null;
    }
  }
  if (live && config.keys.length > 1) say(`key:      #${config.keys.indexOf(live.key) + 1} of ${config.keys.length} works`);
  say(`verdict:  ${works ? `Klevu answers direct from here, 0 credits a search (${live.host})` : "Klevu didn't answer with products"}\n`);
  return { works, image };
}

async function picture(url) {
  say("== A product picture, direct (free) ==");
  if (!url) return say("no picture URL in the results\n");
  const full = url.startsWith("//") ? `https:${url}` : url.startsWith("/") ? `${DISCHEM}${url}` : url;
  const r = await get(full);
  const host = (() => { try { return new URL(full).host; } catch { return "?"; } })();
  const blocked = challenged(r);
  say(`${host}: HTTP ${r.status}  ${r.type || "-"}  ${r.text.length}B  ${blocked ? "BLOCKED by Cloudflare" : r.type.startsWith("image/") ? "a picture" : "not a picture"}\n`);
}

// ----------------------------------------------------------------------- run

say(`Dis-Chem Klevu probe, queries: ${QUERIES.join(", ")}\n`);
const left = await account();
let config = { hosts: [], keys: [], keyNotes: [], mentions: [], scripts: [] };
let html = null;

say("== Dis-Chem search page ==");
if (existsSync(PAGE_FILE)) {
  html = readFileSync(PAGE_FILE, "utf8");
  say(`read from ${PAGE_FILE}, saved by an earlier run: 0 credits`);
} else if (left !== null && left < 10) {
  say(`skipped: ${left} credits left, and premium costs 10\n`);
} else if (credits + 10 > MAX_CREDITS) {
  say(`skipped: would pass the ${MAX_CREDITS}-credit cap\n`);
} else if (KEY) {
  credits += 10;
  const target = `${DISCHEM}/catalogsearch/result/?q=${encodeURIComponent(QUERIES[0])}`;
  const r = await get(`${SCRAPERAPI_URL}?api_key=${encodeURIComponent(KEY)}&url=${encodeURIComponent(target)}&premium=true`);
  if (r.status !== 200 || challenged(r)) {
    say(`through ScraperAPI premium: HTTP ${r.status}  ${r.text.length}B  ${challenged(r) ? "BLOCKED by Cloudflare" : flat(r.text, 70)}\n`);
  } else {
    html = r.text;
    say(`through ScraperAPI premium: HTTP 200, 10 credits`);
    try {
      writeFileSync(PAGE_FILE, html);
      say(`saved to ${PAGE_FILE}: the next run reads it for free`);
    } catch (e) {
      say(`couldn't save it (${flat(e?.message, 60)}): the next run pays again`);
    }
  }
}

if (html) {
  config = klevuConfig(html);
  for (const k of config.keys) secrets.add(k);
  say(`${html.length}B`);
  say(`search hosts: ${config.hosts.join(" ") || "none"}`);
  say(`search keys:  ${config.keys.length} (not printed)`);
  config.keyNotes.forEach((n, i) => say(`  key #${i + 1}: ${n}`));
  say(`Klevu mentions: ${config.mentions.length}`);
  for (const m of config.mentions) say(`  … ${m}`);
  say(`scripts loaded: ${config.scripts.length}`);
  for (const src of config.scripts) say(`  ${flat(mask(src.replace(/[?#].*/, "")), 110)}`);
  say("");
}

const { image } = await klevu(config);
await picture(image);
say(`ScraperAPI credits spent by this run: ${credits} (cap ${MAX_CREDITS})`);
