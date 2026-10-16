import type { FastifyInstance } from "fastify";
import { appUrl } from "../mail/mailer.js";

// robots.txt and sitemap.xml, for search engines. Served here rather than as
// files in the frontend because a sitemap must give full addresses, and the
// app's address is a server setting (FRONTEND_URL), never in the repo. The
// frontend's nginx sends exactly these two paths here.

// The pages worth finding in a search. Everything else is someone's own
// lists and account, or a step in a flow.
export const PUBLIC_PAGES = ["/", "/welcome", "/privacy", "/terms"];

// Never worth indexing: per-person pages, and steps reached only from a link.
const PRIVATE = [
  "/lists/",
  "/account",
  "/profile",
  "/settings",
  "/sign-in",
  "/forgot-password",
  "/reset-password",
  "/confirm-email",
  "/premium",
  "/admin",
  "/api/",
];

// The bots that fetch a page to show a shared link's preview. Some obey
// robots.txt (X's does), so without their own group a shared link to a list
// would show no preview there. They read only the page's head (index.html),
// the same card for every page, never anyone's list: lists come from the API,
// which they can't see.
export const LINK_PREVIEW_BOTS = [
  "Twitterbot",
  "facebookexternalhit",
  "Facebot",
  "LinkedInBot",
  "WhatsApp",
  "TelegramBot",
  "Slackbot-LinkExpanding",
  "Discordbot",
  "Pinterestbot",
];

export function robotsTxt(origin: string): string {
  return [
    "User-agent: *",
    ...PRIVATE.map((p) => `Disallow: ${p}`),
    "",
    // AdSense's crawler reads the pages ads are on, to choose ads that fit.
    "User-agent: Mediapartners-Google",
    "Allow: /",
    "",
    ...LINK_PREVIEW_BOTS.map((bot) => `User-agent: ${bot}`),
    "Disallow: /api/",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml(origin: string): string {
  const urls = PUBLIC_PAGES.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const DAY_SECONDS = 24 * 60 * 60;

export async function crawlerRoutes(app: FastifyInstance) {
  app.get("/robots.txt", async (_req, reply) => {
    reply.header("Cache-Control", `public, max-age=${DAY_SECONDS}`).type("text/plain; charset=utf-8");
    return robotsTxt(appUrl());
  });

  app.get("/sitemap.xml", async (_req, reply) => {
    reply.header("Cache-Control", `public, max-age=${DAY_SECONDS}`).type("application/xml; charset=utf-8");
    return sitemapXml(appUrl());
  });
}
