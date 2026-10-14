import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import { crawlerRoutes, PUBLIC_PAGES, robotsTxt, sitemapXml } from "./crawlers.js";

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

  it("decide about every page: either in the sitemap, or kept out of search", () => {
    const blocked = disallowed(robotsTxt(ORIGIN));
    expect(pages.length).toBeGreaterThan(10);
    for (const page of pages) {
      const listed = PUBLIC_PAGES.includes(page);
      const kept = blocked.some((b) => page.startsWith(b));
      expect(listed !== kept, `${page}: add it to PUBLIC_PAGES or to the Disallow list in crawlers.ts`).toBe(true);
    }
  });

  it("keep everyone's own lists and account out of search", () => {
    const blocked = disallowed(robotsTxt(ORIGIN));
    for (const p of ["/lists/", "/account", "/settings", "/api/"]) expect(blocked).toContain(p);
  });

  it("give full addresses, from the server's setting", () => {
    expect(robotsTxt(ORIGIN)).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    const xml = sitemapXml(ORIGIN);
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/welcome</loc>`);
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
