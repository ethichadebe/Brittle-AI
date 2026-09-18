// Does a JS-rendered store hand over its catalogue to a real browser?
//
// ANSWERED FOR GAME, 2026-09-18: no. Game is removed from STORE_CONFIGS.
//
// The run returned a PerimeterX interstitial, not a catalogue and not an empty
// result set:
//
//   [5] title:     Are you a human?
//       body text: Are you a human? Press and hold the button below to
//                  confirm. Thank You!
//
// The only requests captured were PerimeterX's own telemetry to
// collector-pxbia59zcf.px-cloud.net, because the app never cleared the gate and
// so never asked for products. Getting past a press-and-hold challenge means
// defeating a human-verification mechanism, which this project does not do.
// Not attempted: USE_PROXY=1, which would present a residential IP and might
// avoid the challenge being served at all - it was judged not worth a credit
// for a general merchandiser whose grocery range is thinner than Makro's.
//
// The script is kept because it is not Game-specific: TARGET and ORIGIN point
// it at any store, and it is the only probe here that runs a real browser. If a
// candidate store serves a shell that renders by JavaScript, start with this.
//
// Run inside the backend container, which is the only place with Playwright and
// Chromium installed. scripts/ is not in the image, so the probe is piped in:
//
//   cd /opt/accucery && docker compose -f docker-compose.prod.yml exec -T \
//     -e QUERY=milk -e ORIGIN=https://www.example.co.za \
//     -e TARGET='https://www.example.co.za/search?q=milk' \
//     backend node --input-type=module < scripts/probe-game.mjs
//
// WHY A BROWSER AND NOT curl
//
// probe-store.sh found game.co.za serves a 21KB shell for every route, names no
// commerce platform, and ships src="px/PXBIA59zcf/init.js" - the PerimeterX
// sensor - while rendering "Detecting..." on screen. The catalogue is fetched by
// JavaScript after that sensor mints a _px3 cookie, so no amount of curl will
// see a product.
//
// WHAT IT ANSWERS, AND WHY THOSE
//
//   1. does PerimeterX pass for a headless stealth browser on this IP  -> _px3
//   2. which request carries the products                              -> interceptsUrl
//   3. what that payload looks like                                    -> parse()
//
// Those are exactly the three things playwright.ts's Strategy needs. If (1)
// fails, (2) and (3) are unanswerable and Game is not worth more effort.
//
// Costs no ScraperAPI credits unless USE_PROXY=1. Prints no secrets.
// Output stays under 40 columns.

const QUERY = process.env.QUERY || "milk";
const ORIGIN = process.env.ORIGIN || "https://www.game.co.za";
const TARGET = process.env.TARGET || `${ORIGIN}/search?q=${encodeURIComponent(QUERY)}`;
const SETTLE_MS = Number(process.env.SETTLE_MS || 8000);
const MAX_BODY = 2_000_000;

const w = (s, n = 36) => String(s).slice(0, n);
const wrap = (s, indent = "      ", n = 32) => {
  for (let i = 0; i < s.length; i += n) console.log(indent + s.slice(i, i + n));
};

const { chromium } = await import("playwright-extra");
const stealth = (await import("puppeteer-extra-plugin-stealth")).default;
chromium.use(stealth());
const { newInjectedContext } = await import("fingerprint-injector");

const useProxy = process.env.USE_PROXY === "1" && process.env.SCRAPERAPI_KEY;
console.log(`[1] launch`);
console.log(`    stealth yes  proxy ${useProxy ? "yes" : "no"}`);
if (useProxy) console.log(`    (proxy spends a credit)`);

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PROBE_CHROMIUM && { executablePath: process.env.PROBE_CHROMIUM }),
  args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
});

const seen = [];
try {
  const context = await newInjectedContext(browser, {
    newContextOptions: {
      viewport: { width: 1366, height: 768 },
      ...(useProxy && {
        proxy: {
          server: "http://proxy-server.scraperapi.com:8001",
          username: "scraperapi",
          password: process.env.SCRAPERAPI_KEY,
        },
      }),
    },
  });
  const page = await context.newPage();

  // Record every response as it lands. Bodies are read lazily and guarded: a
  // 2MB bundle is not worth parsing and a failed read must not kill the probe.
  // Every xhr/fetch, not only those declaring JSON. The first version filtered
  // on content-type and would have missed a catalogue served as text/plain -
  // and on Game it recorded only PerimeterX's own telemetry, which told us
  // nothing about whether a catalogue request was ever attempted.
  page.on("response", (res) => {
    const type = res.request().resourceType();
    if (type !== "xhr" && type !== "fetch") return;
    seen.push({
      url: res.url(),
      status: res.status(),
      ct: (res.headers()["content-type"] || "-").split(";")[0],
      res,
    });
  });

  console.log(`\n[2] goto`);
  wrap(TARGET, "    ", 34);
  const started = Date.now();
  let status = "err";
  try {
    const nav = await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 45000 });
    status = nav ? nav.status() : "none";
  } catch (err) {
    console.log(`    navigation failed:`);
    wrap(w(err.message, 120), "      ");
  }
  // The XHR fires after the sensor resolves, so waiting for the DOM is not enough.
  await page.waitForTimeout(SETTLE_MS);
  console.log(`    HTTP ${status}  ${Date.now() - started}ms`);

  console.log(`\n[3] perimeterx cookies`);
  const cookies = await context.cookies(ORIGIN);
  const pxNames = cookies.filter((c) => /^_px/i.test(c.name)).map((c) => c.name);
  // _pxhd is a device id PerimeterX sets on EVERY visit, including ones it goes
  // on to reject, so its presence says nothing. _px3 is the token granted when
  // the sensor is satisfied, and it is the only one that answers "did we pass".
  // The first version matched /^_px/ and reported "set (_pxhd)" on a visit that
  // never got a token - the right answer to the wrong question.
  const token = cookies.find((c) => c.name === "_px3");
  console.log(`    names: ${pxNames.length ? w(pxNames.join(" "), 30) : "none"}`);
  console.log(`    _px3 (the token): ${token ? "set" : "MISSING"}`);
  console.log(`    cookies total: ${cookies.length}`);

  // eslint-disable-next-line no-undef -- this arrow runs inside Chromium via page.evaluate, not in Node, so document is defined there
  const text = await page.evaluate(() => document.body?.innerText || "");
  const stuck = /Detecting\.\.\.|Loading\.\.\./i.test(text);
  console.log(`    still "Detecting/Loading": ${stuck ? "YES" : "no"}`);

  console.log(`\n[4] xhr/fetch requests`);
  console.log(`    ${seen.length} seen`);
  for (const s2 of seen.slice(0, 8)) {
    console.log(`    ${s2.status} ${w(s2.ct, 18)}`);
    wrap(s2.url.replace(/^https?:\/\//, ""), "      ", 30);
  }
  if (!seen.length) console.log(`    the page made NO xhr at all`);

  console.log(`\n[4b] which look like products`);
  // Rank by how product-like the payload is rather than by size or order: the
  // biggest JSON on a page is usually config, and the first is usually consent.
  const scored = [];
  for (const s of seen) {
    let body;
    try {
      const buf = await s.res.body();
      if (buf.length > MAX_BODY) continue;
      body = JSON.parse(buf.toString("utf8"));
    } catch { continue; }
    const flat = JSON.stringify(body);
    let score = 0;
    if (/"(price|sellingPrice|currentPrice|amount)"/i.test(flat)) score += 3;
    if (/"(name|title|productName|displayName)"/i.test(flat)) score += 2;
    if (/"(image|imageUrl|thumbnail|media)"/i.test(flat)) score += 1;
    if (/"(sku|productId|itemId|id)"/i.test(flat)) score += 1;
    scored.push({ ...s, score, body, bytes: flat.length });
  }
  scored.sort((a, b) => b.score - a.score || b.bytes - a.bytes);
  for (const s of scored.slice(0, 5)) {
    console.log(`  score ${s.score}  ${s.status}  ${s.bytes}B`);
    wrap(s.url.replace(/^https?:\/\//, ""), "    ", 34);
    const keys = Array.isArray(s.body) ? ["(array)"] : Object.keys(s.body || {});
    wrap("keys: " + keys.slice(0, 12).join(" "), "      ");
  }
  if (!scored.length) console.log(`    none parsed as JSON`);

  console.log(`\n[5] what rendered`);
  // eslint-disable-next-line no-undef -- runs inside Chromium via page.evaluate
  const title = await page.evaluate(() => document.title || "");
  console.log(`    title:`);
  wrap(w(title, 80), "      ");
  console.log(`    body text:`);
  wrap(w(text.replace(/\s+/g, " ").trim() || "(empty)", 240), "      ");
  const prices = (text.match(/R\s?\d[\d\s]*[.,]\d{2}/g) || []);
  console.log(`    ${prices.length} matches`);
  prices.slice(0, 3).forEach((p) => console.log(`      ${w(p.trim(), 20)}`));

  console.log(`\n[6] verdict`);
  if (!token) {
    console.log(`    no _px3 token: the sensor`);
    console.log(`    did not clear this browser`);
    console.log(`    on this IP. Read [5] first:`);
    console.log(`    a block page and an empty`);
    console.log(`    result set look alike here.`);
    console.log(`    Next lever is USE_PROXY=1,`);
    console.log(`    which spends a credit.`);
  } else if (prices.length > 0 && scored.length) {
    console.log(`    products render AND a json`);
    console.log(`    response exists -> use the`);
    console.log(`    top-scoring url above as`);
    console.log(`    interceptsUrl in`);
    console.log(`    playwright.ts`);
  } else if (prices.length > 0) {
    console.log(`    products render but no json`);
    console.log(`    captured -> server-rendered`);
    console.log(`    after JS; parse the DOM`);
  } else {
    console.log(`    no prices rendered. Either`);
    console.log(`    the query has no results or`);
    console.log(`    the sensor blocked the XHR.`);
  }
} finally {
  await browser.close();
}
