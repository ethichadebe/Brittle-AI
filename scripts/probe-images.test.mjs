// Offline test for scripts/probe-images.mjs. No network, no stores.
//
//   node scripts/probe-images.test.mjs
//
// A stand-in app (/search, /image-proxy) and a stand-in image server that
// fails in each of the ways the probe has to tell apart. The failure modes
// are invented; which one the live image server has is what the probe is for.

import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)), "probe-images.mjs");

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ok   ${n}`); };
const bad = (n, why) => { fail++; console.log(`  FAIL ${n}\n     ${why}`); };
const has = (out, needle, name) => (out.includes(needle) ? ok(name) : bad(name, `expected "${needle}"`));

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${srv.address().port}`)));
const close = (srv) => new Promise((r) => srv.close(r));

// mode:
//   "fine"    - every picture loads
//   "limit"   - more than two at once get 429, as a rate limit would
//   "refuse"  - pictures 3 and 4 are 403 however they are asked for
//   "referer" - a request carrying a Referer is refused, a plain one isn't
function imageServer(mode) {
  let inFlight = 0;
  return http.createServer((req, res) => {
    inFlight++;
    const done = (status, body, type) => {
      setTimeout(() => {
        inFlight--;
        res.writeHead(status, { "content-type": type, ...(status === 429 && { "retry-after": "5" }) });
        res.end(body);
      }, 80);
    };
    const n = Number(req.url.match(/files\/p(\d)/)?.[1]);
    if (mode === "limit" && inFlight > 2) return done(429, "slow down", "text/plain");
    if (mode === "refuse" && (n === 3 || n === 4)) return done(403, "Forbidden", "text/html");
    if (mode === "referer" && req.headers.referer) return done(403, "hotlink", "text/html");
    done(200, Buffer.alloc(1200, 1), "image/webp");
  });
}

function appServer(images) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/search") {
      const products = [1, 2, 3, 4, 5, 6].map((n) => ({ productId: `p${n}`, name: `Bread ${n}`, imageUrl: `${images}/v2/files/p${n}?width=600` }));
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ products }));
    }
    if (u.pathname === "/image-proxy") {
      // As the real proxy does: fetch upstream with a Referer, pass the status on.
      const up = await fetch(u.searchParams.get("url"), { headers: { Referer: "https://www.checkers.co.za/" } });
      res.writeHead(up.status, { "content-type": up.headers.get("content-type") ?? "image/jpeg" });
      return res.end(Buffer.from(await up.arrayBuffer()));
    }
    res.writeHead(404);
    res.end();
  });
}

async function run(mode) {
  const images = imageServer(mode);
  const app = appServer(await listen(images));
  const base = await listen(app);
  try {
    const child = spawn(process.execPath, [PROBE], { env: { ...process.env, APP_BASE: base } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    await new Promise((r) => child.on("close", r));
    return out;
  } finally {
    await close(app);
    await close(images);
  }
}

const outs = {};
console.log("every picture loads");
outs.fine = await run("fine");
has(outs.fine, "search: 6 products", "reads the search");
has(outs.fine, "statuses: 200 x6", "all six at once");
has(outs.fine, "the gaps are in the browser", "verdict: not the server");

console.log("\na rate limit");
outs.limit = await run("limit");
has(outs.limit, "429 x", "sees the 429s when asked at once");
has(outs.limit, "fail when asked for at once", "verdict: a limit, not a refusal");

console.log("\nsome pictures refused");
outs.refuse = await run("refuse");
has(outs.refuse, " 3 Bread 3", "lists each picture");
has(outs.refuse, "403 FAIL", "with its status");
has(outs.refuse, "/v2/files/p3", "and the address of a failing one");
has(outs.refuse, "2 fail even one at a time", "verdict: refused whatever the pace");

console.log("\nthe proxy's request refused");
outs.referer = await run("referer");
has(outs.referer, "fail through the proxy but load straight", "verdict: the proxy's request");

if (fail) for (const [k, v] of Object.entries(outs)) console.log(`\n--- ${k} ---\n${v}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
