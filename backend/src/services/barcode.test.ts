import { describe, it, expect, vi } from "vitest";
import { createBarcodeLookup, isValidBarcode, searchName } from "./barcode.js";

// Pure — Open Food Facts is a stubbed fetch, so this never touches the network.
const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("which barcodes are worth looking up", () => {
  it("accepts EAN-13, EAN-8, UPC-A and GTIN-14 with a check digit that adds up", () => {
    expect(isValidBarcode("5449000000996")).toBe(true); // Coca-Cola 330ml
    expect(isValidBarcode("6001087340120")).toBe(true);
    expect(isValidBarcode("96385074")).toBe(true);
    expect(isValidBarcode("036000291452")).toBe(true);
    expect(isValidBarcode("10012345678902")).toBe(true);
  });

  it("refuses a misread digit, a wrong length, and anything that isn't digits", () => {
    expect(isValidBarcode("5449000000997")).toBe(false);
    expect(isValidBarcode("544900000099")).toBe(false);
    expect(isValidBarcode("54490000009961")).toBe(false);
    expect(isValidBarcode("12345")).toBe(false);
    expect(isValidBarcode("544900000099a")).toBe(false);
    expect(isValidBarcode("../../etc/passwd")).toBe(false);
  });
});

describe("the name a barcode searches for", () => {
  it("adds the size when the name doesn't already say it", () => {
    expect(searchName({ product_name: "Coca-Cola", quantity: "330 ml" })).toBe("Coca-Cola 330 ml");
    expect(searchName({ product_name: "Clover Milk 2L", quantity: "2l" })).toBe("Clover Milk 2L");
  });

  it("prefers the English name, then the name, then the generic name", () => {
    expect(searchName({ product_name_en: "Rooibos tea", product_name: "Rooibostee" })).toBe("Rooibos tea");
    expect(searchName({ product_name: "", generic_name: "Maize meal" })).toBe("Maize meal");
  });

  it("is nothing when the product has no name, and never runs long", () => {
    expect(searchName({ quantity: "1 kg" })).toBeNull();
    expect(searchName({ product_name: "  " })).toBeNull();
    expect(searchName({ product_name: "x".repeat(200) })!.length).toBe(80);
  });
});

describe("looking a barcode up", () => {
  it("asks Open Food Facts once, saying who is asking, and remembers the answer", async () => {
    const fetchFn = vi.fn(async () => answer(200, { status: 1, product: { product_name: "Coca-Cola", quantity: "330 ml" } }));
    const lookup = createBarcodeLookup(fetchFn as unknown as typeof fetch);

    expect(await lookup("5449000000996")).toBe("Coca-Cola 330 ml");
    expect(await lookup("5449000000996")).toBe("Coca-Cola 330 ml");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/5449000000996\.json\?fields=/);
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^Accucery\/1\.0 \(.+; .+@.+\)$/);
  });

  it("answers nothing for a barcode Open Food Facts doesn't know, and remembers that for a day", async () => {
    let t = 0;
    const fetchFn = vi.fn(async () => answer(404, { status: 0, status_verbose: "product not found" }));
    const lookup = createBarcodeLookup(fetchFn as unknown as typeof fetch, () => t);

    expect(await lookup("6001087340120")).toBeNull();
    expect(await lookup("6001087340120")).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    t += 25 * 60 * 60 * 1000;
    await lookup("6001087340120");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("treats a known product with no name as not known", async () => {
    const lookup = createBarcodeLookup((async () => answer(200, { status: 1, product: {} })) as unknown as typeof fetch);
    expect(await lookup("96385074")).toBeNull();
  });

  it("throws, and remembers nothing, when Open Food Facts is down", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response("<html>", { status: 200 }))
      .mockResolvedValueOnce(answer(200, { status: 1, product: { product_name: "Coca-Cola" } }));
    const lookup = createBarcodeLookup(fetchFn as unknown as typeof fetch);

    await expect(lookup("5449000000996")).rejects.toThrow("502");
    await expect(lookup("5449000000996")).rejects.toThrow("unreadable");
    expect(await lookup("5449000000996")).toBe("Coca-Cola");
  });
});
