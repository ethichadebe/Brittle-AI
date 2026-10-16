import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { DEVICE_ID_COOKIE, registerDeviceId } from "../deviceId.js";
import { limiter, LIMITS } from "../rateLimit.js";
import { barcodeRoutes, setBarcodeLookup } from "./barcode.js";

// Pure — the lookup is stubbed, so no database and no Open Food Facts.
let app: FastifyInstance;
let asked: string[] = [];

beforeAll(async () => {
  app = Fastify();
  await registerDeviceId(app);
  await app.register(barcodeRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  limiter.clear();
  asked = [];
  setBarcodeLookup(async (code) => {
    asked.push(code);
    return code === "5449000000996" ? "Coca-Cola 330 ml" : null;
  });
});

const get = (code: string, deviceId = "3fa85f64-5717-4562-b3fc-2c963f66afa6") =>
  app.inject({ method: "GET", url: `/products/barcode/${code}`, cookies: { [DEVICE_ID_COOKIE]: deviceId } });

describe("GET /products/barcode/:code", () => {
  it("answers with the product name, or nothing when it isn't known", async () => {
    const known = await get("5449000000996");
    expect(known.statusCode).toBe(200);
    expect(known.json()).toEqual({ code: "5449000000996", name: "Coca-Cola 330 ml" });

    const unknown = await get("6001087340120");
    expect(unknown.json()).toEqual({ code: "6001087340120", name: null });
  });

  it("refuses a misread barcode without asking anyone", async () => {
    const res = await get("5449000000997");
    expect(res.statusCode).toBe(400);
    expect(asked).toEqual([]);
  });

  it("says try again when the lookup fails, without passing the error on", async () => {
    setBarcodeLookup(async () => {
      throw new Error("Open Food Facts answered 503");
    });
    const res = await get("5449000000996");
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/Try again/);
    expect(res.body).not.toMatch(/503/);
  });

  it("limits how many barcodes one device looks up in an hour", async () => {
    const device = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
    const max = LIMITS.barcodesPerDevice[0].max;
    for (let i = 0; i < max; i++) expect((await get("5449000000996", device)).statusCode).toBe(200);

    const over = await get("5449000000996", device);
    expect(over.statusCode).toBe(429);
    expect(over.headers["retry-after"]).toBeDefined();
  });
});
