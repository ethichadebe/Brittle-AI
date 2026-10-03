// Why do some product pictures not load? (#139, 2026-10-03)
//
// A Checkers search for "The Bakery White Bread 700g" showed pictures for the
// first five results and a broken one for most of the rest. Every picture
// comes from catalog.sixty60.co.za, which the image proxy allows, so it is not
// the allow-list. This asks the running app the same way the browser does, and
// tells apart:
//   - the image server refusing these pictures from the VPS, whatever the
//     pace (the same status every time);
//   - a refusal only when many are asked for at once (a rate limit: the first
//     few load, the rest don't, which is what the screenshot looked like);
//   - the proxy's own request being refused where a plain one isn't.
//
// Run inside the backend container, where the app answers on localhost:3000,
// and post the output to #139:
//
//   curl -fsSL -o /tmp/probe-images.mjs \
//     https://raw.githubusercontent.com/ethichadebe/Brittle-AI/master/scripts/probe-images.mjs
//   cd /opt/accucery && bash scripts/report.sh 139 -- sh -c \
//     'docker compose -f docker-compose.prod.yml exec -T backend \
//        node --input-type=module < /tmp/probe-images.mjs'
//
// -e STORE=shoprite -e QUERY=milk to look at another search. It reuses the
// app's cached search when there is one, so it usually spends no ScraperAPI
// credits. Prints picture addresses (public) and statuses, nothing else.

const BASE = process.env.APP_BASE || "http://localhost:3000";
const STORE = process.env.STORE || "checkers";
const QUERY = process.env.QUERY || "The Bakery White Bread 700g";

async function check(url, headers = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const body = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") ?? "?";
    const note = res.ok
      ? ""
      : [res.headers.get("retry-after") && `retry-after ${res.headers.get("retry-after")}`,
         res.headers.get("server") && `server ${res.headers.get("server")}`,
         body.toString("utf8").replace(/\s+/g, " ").trim().slice(0, 60)]
          .filter(Boolean)
          .join("; ");
    return { status: res.status, ok: res.ok, type, bytes: body.length, ms: Date.now() - started, note };
  } catch (e) {
    return { status: 0, ok: false, type: "-", bytes: 0, ms: Date.now() - started, note: String(e?.cause?.code ?? e?.message ?? e).slice(0, 60) };
  }
}

const proxied = (url) => `${BASE}/image-proxy?url=${encodeURIComponent(url)}`;
const host = (url) => { try { return new URL(url).hostname; } catch { return "(none)"; } };
const show = (r) => `${r.status}${r.ok ? "" : " FAIL"} ${r.type.split(";")[0]} ${r.bytes}b ${r.ms}ms${r.note ? ` (${r.note})` : ""}`;

console.log(`image probe: ${STORE} "${QUERY}" via ${BASE}\n`);

const search = await fetch(`${BASE}/search?store=${encodeURIComponent(STORE)}&q=${encodeURIComponent(QUERY)}`);
if (!search.ok) {
  console.log(`search: HTTP ${search.status}, stopping`);
  process.exit(0);
}
const products = ((await search.json())?.products ?? []).slice(0, 20);
console.log(`search: ${products.length} products`);
console.log(`hosts: ${[...new Set(products.map((p) => host(p.imageUrl)))].join(", ")}`);
const empty = products.filter((p) => !p.imageUrl).length;
if (empty) console.log(`no picture address at all: ${empty}`);

// One at a time, a short pause between: what each picture does when nothing
// else is asked for. Through the proxy, then straight from the image server.
console.log(`\n[1] one at a time: proxy | straight from the image server`);
const seq = [];
for (const [i, p] of products.entries()) {
  if (!p.imageUrl) continue;
  const viaProxy = await check(proxied(p.imageUrl));
  const direct = await check(p.imageUrl);
  seq.push({ viaProxy, direct });
  console.log(`${String(i + 1).padStart(2)} ${String(p.name).slice(0, 34).padEnd(34)} ${show(viaProxy)} | ${show(direct)}`);
  if (!viaProxy.ok || !direct.ok) console.log(`     ${p.imageUrl}`);
  await new Promise((r) => setTimeout(r, 300));
}

// All at once through the proxy, as a browser opening the results does.
console.log(`\n[2] all at once through the proxy`);
const burst = await Promise.all(products.filter((p) => p.imageUrl).map((p) => check(proxied(p.imageUrl))));
const tally = {};
for (const r of burst) tally[r.status] = (tally[r.status] ?? 0) + 1;
console.log(`statuses: ${Object.entries(tally).map(([s, n]) => `${s} x${n}`).join(", ")}`);

const failed = (rs, k) => rs.filter((r) => !r[k].ok).length;
const seqProxyFail = failed(seq, "viaProxy");
const seqDirectFail = failed(seq, "direct");
const burstFail = burst.filter((r) => !r.ok).length;

console.log(`\nverdict:`);
if (!products.length) console.log(`- no products to look at; try another QUERY`);
else if (!seqProxyFail && !seqDirectFail && !burstFail) console.log(`- every picture loads from the server now; the gaps are in the browser (its cache, or the page)`);
else if (!seqProxyFail && burstFail) console.log(`- pictures load one at a time but ${burstFail} of ${burst.length} fail when asked for at once: the image server limits how many it serves together`);
else if (seqProxyFail && !seqDirectFail) console.log(`- ${seqProxyFail} fail through the proxy but load straight from the image server: the proxy's request is what's refused`);
else console.log(`- ${seqDirectFail} fail even one at a time, straight from the image server: it refuses those pictures from this server (see the statuses above)`);
