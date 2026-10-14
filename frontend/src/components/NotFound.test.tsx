import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen";

// An address the app doesn't have gets the app's own "not found" page, with
// a way back, rather than the router's bare default.
async function render(path: string): Promise<string> {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToString(<RouterProvider router={router} />);
}

describe("an unknown address", () => {
  it("shows the not-found page, with links home and to the landing page", async () => {
    const html = await render("/no-such-page");
    expect(html).toContain("Page not found");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/welcome"');
  });

  it("a known one doesn't", async () => {
    expect(await render("/terms")).not.toContain("Page not found");
  });
});
