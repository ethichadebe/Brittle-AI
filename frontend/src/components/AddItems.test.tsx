import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AddItems } from "./AddItems";
import { PHOTO_SEARCH_ON } from "../lib/photo";

// Photo search is paused (2026-10-18): the add screen shows the camera only
// while the switch in src/lib/photo.ts is on.
const markup = () =>
  renderToStaticMarkup(
    <AddItems
      listId="list-1"
      storeSlug="checkers"
      storeName="Checkers"
      useLoyalty={false}
      items={[]}
      onSaved={() => {}}
      onRemoved={() => {}}
      onDone={() => {}}
    />
  );

describe("the add screen and photo search", () => {
  it("is paused for now", () => {
    expect(PHOTO_SEARCH_ON).toBe(false);
  });

  it("shows the camera and the photo picker only while photo search is on", () => {
    const html = markup();
    expect(html.includes("Search with the camera")).toBe(PHOTO_SEARCH_ON);
    expect(html.includes('type="file"')).toBe(PHOTO_SEARCH_ON);
  });

  it("still offers the search box and Done", () => {
    const html = markup();
    expect(html).toContain('aria-label="Search Checkers"');
    expect(html).toContain(">Done</button>");
  });
});
