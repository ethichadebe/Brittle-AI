// Can the app ask Pick n Pay for one store's prices with plain requests? (#132)
//
// The location probe (#66) reached Pick n Pay's store-aware search only from
// inside a browser. The scrapers send plain requests, so before Pick n Pay is
// moved onto that search this asks, from the VPS, both ways the scrapers can:
// straight to pnp.co.za, and through ScraperAPI's API endpoint. For each it
// walks the chain the site itself uses (#66):
//
//   POST .../users/anonymous/carts                 -> a cart, at a default store
//   POST .../carts/{guid}/addresses/delivery       Sandton's coordinates
//   GET  .../carts/{guid}                          -> the store Sandton gets
//   POST .../products/search?query=&storeCode=     that store's products
//
// then searches the same query at the default store too, to show the store
// code really changes the prices, and prints one product as the API sends it,
// so the scraper's parser is written against the real shape.
//
// Run in the backend container and post the output to #132:
//
//   curl -fsSL -o /tmp/probe-pnp-store-search.mjs \
//     https://raw.githubusercontent.com/ethichadebe/Brittle-AI/master/scripts/probe-pnp-store-search.mjs
//   cd /opt/accucery && bash scripts/report.sh 132 -- sh -c \
//     'docker compose -f docker-compose.prod.yml exec -T backend \
//        node --input-type=module < /tmp/probe-pnp-store-search.mjs'
//
// About a dozen requests; through ScraperAPI, about six credits' worth of
// requests. Prints no keys or cookies: never a URL carrying the key.

const ORIGIN = process.env.PNP_ORIGIN || "https://www.pnp.co.za";
const SCRAPERAPI_URL = process.env.SCRAPERAPI_URL || "http://api.scraperapi.com/";
const KEY = process.env.SCRAPERAPI_KEY || "";
const QUERY = process.env.QUERY || "milk";
// Sandton: the place the other stores' default branch comes from (#130).
const PLACE = { town: "Sandton", street: "Rivonia Road", postalCode: "2196", latitude: -26.1076, longitude: 28.0567 };
const BASE = "/pnphybris/v2/pnp-spa";
const FIELDS = "products(code,name,price(FULL),images(DEFAULT),potentialPromotions(FULL),stock(FULL),available)";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  Origin: ORIGIN,
  Referer: `${ORIGIN}/`,
  "x-anonymous-consents": "%5B%5D",
  "x-pnp-cache-key": "anonymous",
};

const flat = (s, n = 120) => String(s).replace(/\s+/g, " ").trim().slice(0, n);

function client(mode) {
  return async function call(method, path, body) {
    const target = `${ORIGIN}${path}`;
    const url = mode === "scraperapi"
      ? `${SCRAPERAPI_URL}?api_key=${encodeURIComponent(KEY)}&url=${encodeURIComponent(target)}&keep_headers=true`
      : target;
    try {
      const res = await fetch(url, {
        method,
        headers: HEADERS,
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(60000),
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON: shown below */ }
      return { ok: res.ok, status: res.status, json, text };
    } catch (e) {
      return { ok: false, status: 0, json: null, text: String(e?.cause?.code ?? e?.message ?? e) };
    }
  };
}

const summary = (r) => (r.ok ? `${r.status}` : `${r.status} FAIL ${flat(r.text)}`);
const productLine = (p) =>
  `${flat(p.name, 40).padEnd(40)} R${p.price?.value ?? "?"}${p.price?.oldPrice ? ` (was R${p.price.oldPrice})` : ""}${p.potentialPromotions?.length ? ` +${p.potentialPromotions.length} promo` : ""}`;

async function run(mode) {
  console.log(`== ${mode === "scraperapi" ? "through ScraperAPI" : "straight to pnp.co.za"} ==`);
  const call = client(mode);
  const cart = await call("POST", `${BASE}/users/anonymous/carts?fields=DEFAULT&lang=en&curr=ZAR`, {});
  console.log(`cart:     ${summary(cart)}  default store ${cart.json?.baseStore?.uid ?? "?"}`);
  if (!cart.ok || !cart.json?.guid) return { mode, works: false };
  const guid = cart.json.guid;
  const defaultStore = cart.json.baseStore?.uid;

  const address = await call("POST", `${BASE}/users/anonymous/carts/${guid}/addresses/delivery?lang=en&curr=ZAR`, {
    streetnumber: "1", streetname: PLACE.street, district: PLACE.town, town: PLACE.town, postalCode: PLACE.postalCode,
    latitude: PLACE.latitude, longitude: PLACE.longitude, country: { isocode: "ZA" }, defaultAddress: false, line2: `1 ${PLACE.street}`,
  });
  console.log(`address:  ${summary(address)}`);
  const assigned = await call("GET", `${BASE}/users/anonymous/carts/${guid}?fields=DEFAULT&lang=en&curr=ZAR`);
  const store = assigned.json?.baseStore?.uid;
  console.log(`store:    ${summary(assigned)}  ${store ? `${assigned.json.baseStore.displayName ?? ""} (${store})` : "none assigned"}`);

  const search = (code) =>
    call("POST", `${BASE}/products/search?fields=${encodeURIComponent(FIELDS)}&query=${encodeURIComponent(QUERY)}&pageSize=20${code ? `&storeCode=${code}` : ""}&lang=en&curr=ZAR`, {});
  const here = store ? await search(store) : null;
  const products = here?.json?.products ?? [];
  console.log(`search:   ${here ? summary(here) : "skipped"}  ${products.length} products at ${store ?? "?"}`);
  for (const p of products.slice(0, 3)) console.log(`  ${productLine(p)}`);

  // The same search at the default store: different prices prove storeCode matters.
  if (defaultStore && defaultStore !== store) {
    const there = await search(defaultStore);
    const byCode = new Map((there.json?.products ?? []).map((p) => [p.code, p]));
    const shared = products.filter((p) => byCode.has(p.code));
    const differ = shared.filter((p) => p.price?.value !== byCode.get(p.code).price?.value);
    console.log(`compared: ${summary(there)}  at ${defaultStore}: ${shared.length} shared, ${differ.length} priced differently`);
    for (const p of differ.slice(0, 3)) console.log(`  ${flat(p.name, 40).padEnd(40)} ${store} R${p.price?.value}  ${defaultStore} R${byCode.get(p.code).price?.value}`);
  }

  if (products[0]) {
    const p = products[0];
    console.log(`one product as sent: keys ${Object.keys(p).join(",")}`);
    console.log(`  price: ${flat(JSON.stringify(p.price), 300)}`);
    console.log(`  images: ${flat(JSON.stringify((p.images ?? []).slice(0, 2)), 300)}`);
    console.log(`  potentialPromotions: ${flat(JSON.stringify(p.potentialPromotions ?? null), 400)}`);
  }
  console.log("");
  return { mode, works: products.length > 0 };
}

console.log(`Pick n Pay store-search probe (#132), query "${QUERY}"\n`);
const results = [await run("direct")];
if (KEY) results.push(await run("scraperapi"));
else console.log("== through ScraperAPI ==\nskipped: SCRAPERAPI_KEY is not set\n");

console.log("verdict:");
const working = results.filter((r) => r.works).map((r) => r.mode);
if (working.includes("direct")) console.log("- plain requests straight to pnp.co.za work: no ScraperAPI needed");
else if (working.includes("scraperapi")) console.log("- only through ScraperAPI: the scraper sends it that way, as for Checkers");
else console.log("- neither way got products: Pick n Pay needs the browser, or the chain has changed (see the statuses)");
