import type { FastifyInstance } from "fastify";

const ALLOWED_HOSTS = [
  "checkers.co.za",
  "sixty60.co.za",
  "shoprite.co.za",
  "pnp.co.za",
];

function hostname(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}

function isAllowed(url: string): boolean {
  const h = hostname(url);
  return h !== null && ALLOWED_HOSTS.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

export async function imageProxyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { url: string } }>("/image-proxy", async (req, reply) => {
    const { url } = req.query;
    if (!url || !isAllowed(url)) {
      return reply.status(400).send("Invalid or disallowed image URL");
    }

    const referer = hostname(url)?.endsWith("pnp.co.za")
      ? "https://www.pnp.co.za/"
      : "https://www.checkers.co.za/";
    const upstream = await fetch(url, {
      headers: {
        "Referer": referer,
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
