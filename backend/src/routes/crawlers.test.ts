import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import { crawlerRoutes, LINK_PREVIEW_BOTS, PUBLIC_PAGES, SAME_AS, robotsTxt, sitemapXml } from "./crawlers.js";

const REPO = join(import.meta.dirname, "..", "..", "..");
const ORIGIN = "https://app.example.com";

// Each page of the frontend, as its address: "lists.$listId.tsx" -> "/lists/$listId".
const pages = readdirSync(join(REPO, "frontend", "src", "routes"))
  .filter((f) => f.endsWith(".tsx") && f !== "__root.tsx")
  .map((f) => "/" + f.replace(/\.tsx$/, "").replace(/\.?index$/, "").replace(/\./g, "/"));

const disallowed = (robots: string) =>
  robots
    .split("User-agent: Mediapartners-Google")[0]
    .split("\n")
    .filter((l) => l.startsWith("Disallow: "))
    .map((l) => l.slice("Disallow: ".length));

describe("robots.txt and the sitemap", () => {
  const before = process.env.FRONTEND_URL;
  afterEach(() => {
    process.env.FRONTEND_URL = before;
  });

  it("decide about every page: in the sitemap, the same as one that is, or kept out of search", () => {
    const blocked = disallowed(robotsTxt(ORIGIN));
    expect(pages.length).toBeGreaterThan(10);
    for (const page of pages) {
      const listed = PUBLIC_PAGES.includes(page);
      const same = page in SAME_AS;
      const kept = blocked.some((b) => page.startsWith(b));
      expect([listed, same, kept].filter(Boolean), `${page}: add it to PUBLIC_PAGES, SAME_AS or the Disallow list in crawlers.ts`).toHaveLength(1);
    }
  });

  // 2026-10-21: /welcome is the landing page a first visit to / shows. It
  // stays open to search engines, so they can read that it's the same page,
  // but only / is offered to them.
  it("offer one address per page: a page the same as another stays out of the sitemap", () => {
    const xml = sitemapXml(ORIGIN);
    for (const [page, target] of Object.entries(SAME_AS)) {
      expect(xml).not.toContain(`<loc>${ORIGIN}${page}</loc>`);
      expect(PUBLIC_PAGES).toContain(target);
      expect(disallowed(robotsTxt(ORIGIN)).some((b) => page.startsWith(b)), page).toBe(false);
    }
  });

  it("keep everyone's own lists and account out of search", () => {
    const blocked = disallowed(robotsTxt(ORIGIN));
    for (const p of ["/lists/", "/account", "/settings", "/api/"]) expect(blocked).toContain(p);
  });

  it("let link-preview bots read any page, so every shared link shows its card", () => {
    // The rules a bot follows: the group naming it, else the "*" group.
    const groupFor = (bot: string) => {
      const groups = robotsTxt(ORIGIN).split(/\n\n+/);
      return groups.find((g) => g.split("\n").includes(`User-agent: ${bot}`)) ?? groups.find((g) => g.includes("User-agent: *"))!;
    };
    for (const bot of ["Twitterbot", "facebookexternalhit", "WhatsApp", "TelegramBot", "LinkedInBot"]) {
      expect(LINK_PREVIEW_BOTS).toContain(bot);
      const rules = groupFor(bot);
      expect(rules, bot).toContain("Allow: /");
      expect(rules, bot).not.toContain("Disallow: /lists/");
    }
    // Everything else still keeps out of people's lists.
    expect(groupFor("Googlebot")).toContain("Disallow: /lists/");
  });

  it("give full addresses, from the server's setting", () => {
    expect(robotsTxt(ORIGIN)).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    const xml = sitemapXml(ORIGIN);
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xml).not.toContain("/lists");
  });

  it("are served with the right types", async () => {
    process.env.FRONTEND_URL = `${ORIGIN}/`;
    const app = Fastify();
    await app.register(crawlerRoutes);
    try {
      const robots = await app.inject({ method: "GET", url: "/robots.txt" });
      expect(robots.headers["content-type"]).toMatch(/^text\/plain/);
      expect(robots.body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
      const sitemap = await app.inject({ method: "GET", url: "/sitemap.xml" });
      expect(sitemap.headers["content-type"]).toMatch(/^application\/xml/);
      expect(sitemap.body).toMatch(/^<\?xml/);
    } finally {
      await app.close();
    }
  });

  it("reach the backend through the frontend's nginx", () => {
    const conf = readFileSync(join(REPO, "nginx.conf"), "utf8");
    expect(conf).toMatch(/location = \/robots\.txt \{\s+proxy_pass\s+http:\/\/backend:3000\/robots\.txt;/);
    expect(conf).toMatch(/location = \/sitemap\.xml \{\s+proxy_pass\s+http:\/\/backend:3000\/sitemap\.xml;/);
  });
});
