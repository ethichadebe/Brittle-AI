import type { FastifyInstance } from "fastify";

// Which hosts may be proxied, and the Referer each one is fetched with. One map
// rather than two lists: a store whose images are on a different domain from its
// site needs both, and keeping them apart is how Woolworths shipped with every
// image returning 400 while the store itself worked.
//
// Shoprite is deliberately fetched with a Checkers referer, which is what this
// did before and what its CDN is known to accept. Changing it is not this fix's
// job.
const HOST_REFERERS: Record<string, string> = {
  "checkers.co.za": "https://www.checkers.co.za/",
  "sixty60.co.za": "https://www.checkers.co.za/",
  "shoprite.co.za": "https://www.checkers.co.za/",
  "pnp.co.za": "https://www.pnp.co.za/",
  // Woolworths serves product images from a separate assets domain.
  "woolworthsstatic.co.za": "https://www.woolworths.co.za/",
  "woolworths.co.za": "https://www.woolworths.co.za/",
  // Makro runs Flipkart's stack but serves its own product images, so this is
  // makro.co.za and NOT flixcart.com - the probe printed the real URLs rather
  // than letting the platform imply the host.
  "makro.co.za": "https://www.makro.co.za/",
};

const ALLOWED_HOSTS = Object.keys(HOST_REFERERS);

function hostname(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}

/** Matches the host itself or any subdomain, never a look-alike suffix. */
function matches(host: string, allowed: string): boolean {
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function isAllowed(url: string): boolean {
  const h = hostname(url);
  return h !== null && ALLOWED_HOSTS.some((allowed) => matches(h, allowed));
}

/** The Referer an allowed host is fetched with. Empty for a host we do not serve. */
export function refererFor(url: string): string {
  const h = hostname(url);
  if (h === null) return "";
  const hit = ALLOWED_HOSTS.find((allowed) => matches(h, allowed));
  return hit ? HOST_REFERERS[hit] : "";
}

export async function imageProxyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { url: string } }>("/image-proxy", async (req, reply) => {
    const { url } = req.query;
    if (!url || !isAllowed(url)) {
      return reply.status(400).send("Invalid or disallowed image URL");
    }

    const upstream = await fetch(url, {
      headers: {
        "Referer": refererFor(url),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!upstream.ok) {
      return reply.status(upstream.status).send();
    }

    reply.header("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
    reply.header("Cache-Control", "public, max-age=86400");
    reply.header("Access-Control-Allow-Origin", "*");

    return reply.send(Buffer.from(await upstream.arrayBuffer()));
  });
}
