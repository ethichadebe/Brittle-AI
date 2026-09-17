// Offline test for scripts/probe-game.mjs. No network, no game.co.za.
//
//   node scripts/probe-game.test.mjs
//
// Serves a local fixture that behaves the way Game's page does - a shell that
// renders nothing, then fetches products by XHR and paints prices - and asserts
// the probe finds the XHR among decoys and reports it.
//
// The fixture is INVENTED. It proves the probe can find a catalogue request it
// was never told about; it makes no claim about Game's real endpoint. Writing a
// plausible fixture and believing it is how makro.ts shipped reading an
// imageUrl that did not exist.

import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, "probe-game.mjs");
const CHROMIUM = process.env.PROBE_CHROMIUM || "/opt/pw-browsers/chromium";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ok   ${n}`); };
const bad = (n, why) => { fail++; console.log(`  FAIL ${n}\n     ${why}`); };
const has = (out, needle, name) =>
  out.includes(needle) ? ok(name) : bad(name, `expected "${needle}"`);
const hasnt = (out, needle, name) =>
  out.includes(needle) ? bad(name, `found "${needle}"`) : ok(name);

// A shell that paints nothing until its XHR returns - Game's shape. The decoys
// matter: a consent blob and a big config blob are what a naive "first JSON" or
// "biggest JSON" rule would wrongly pick.
// The catalogue is deliberately SLOW. On Game the XHR only fires once the
// PerimeterX sensor resolves, so a probe that reads the DOM at
// domcontentloaded sees an empty page and would report a live store as
// blocked. An instant fixture cannot catch that, and did not: removing the
// settle wait passed every assertion until this delay existed.
const CATALOGUE_DELAY_MS = 1200;

function server({ products = true, setCookie = true } = {}) {
  return http.createServer((req, res) => {
    const json = (o, extra = {}) => {
      res.writeHead(200, { "content-type": "application/json", ...extra });
      res.end(JSON.stringify(o));
    };
    if (req.url.startsWith("/consent")) return json({ consent: true, region: "za" });
    if (req.url.startsWith("/config"))
      return json({ flags: Object.fromEntries([...Array(400)].map((_, i) => [`flag${i}`, i])) });
    if (req.url.startsWith("/v2/catalogue/query"))
      return setTimeout(() => json(products
        ? { results: [
            { sku: "G1", displayName: "Fresh Milk 2L", currentPrice: 34.99, thumbnail: "/m.jpg" },
            { sku: "G2", displayName: "Low Fat Milk 1L", currentPrice: 21.5, thumbnail: "/l.jpg" },
          ] }
        : { results: [] }), CATALOGUE_DELAY_MS);
    const cookie = setCookie ? { "set-cookie": "_px3=abc123; Path=/" } : {};
    res.writeHead(200, { "content-type": "text/html", ...cookie });
    res.end(`<html><body><div id=a>Detecting...</div><script>
      fetch('/consent').then(r=>r.json());
      fetch('/config').then(r=>r.json());
      fetch('/v2/catalogue/query?q=milk').then(r=>r.json()).then(d=>{
        document.getElementById('a').innerText =
          d.results.map(p=>p.displayName+' R'+p.currentPrice.toFixed(2)).join(' ') || 'No results';
      });
    </script></body></html>`);
  });
}

async function runProbe(srv, env = {}) {
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    const child = spawn(process.execPath, [PROBE], {
      env: { ...process.env, PROBE_CHROMIUM: CHROMIUM, SETTLE_MS: "2500",
             ORIGIN: `http://127.0.0.1:${port}`,
             TARGET: `http://127.0.0.1:${port}/search?q=milk`, ...env },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    await new Promise((r) => child.on("close", r));
    return out;
  } finally {
    await new Promise((r) => srv.close(r));
  }
}

console.log("a catalogue XHR among decoys");
let out = await runProbe(server());
has(out, "_px*: set", "sees the bot cookie was set");
has(out, 'still "Detecting/Loading": no', "notices the page finished rendering");
has(out, "/v2/catalogue/query", "names the catalogue request");
has(out, "score 7", "scores it as product-shaped");
has(out, "keys: results", "reports its top-level keys");
has(out, "2 matches", "counts the rendered prices");
has(out, "use the", "verdict points at interceptsUrl");
// The decoys are the point: both are JSON, /config is far larger.
const top = out.slice(out.indexOf("[4]"), out.indexOf("[5]"));
hasnt(top.slice(0, top.indexOf("score", top.indexOf("score") + 1)), "/config",
  "does not rank the big config blob first");

console.log("\nthe sensor never lets go");
out = await runProbe(server({ setCookie: false, products: false }));
has(out, "_px*: MISSING", "reports the missing cookie");
has(out, "not reachable", "verdict says stop rather than guess");

console.log("\nreachable, but the query has no results");
out = await runProbe(server({ products: false }));
has(out, "_px*: set", "cookie still reported");
has(out, "0 matches", "no prices found");
has(out, "no prices rendered", "verdict distinguishes this from a block");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
