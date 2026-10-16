import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ZXING_WASM_SHA256 } from "barcode-detector/ponyfill";
import { contentType, locate, READER_FILES, readerDir } from "./reader";

const FRONTEND = join(import.meta.dirname, "..", "..");
const read = (name: string) => readFileSync(locate(READER_FILES[name], FRONTEND));

describe("the photo readers served from this site", () => {
  it("are all installed", () => {
    for (const file of Object.values(READER_FILES)) expect(() => locate(file, FRONTEND)).not.toThrow();
  });

  // The barcode reader's code expects one exact WebAssembly build. If an
  // update brings two different versions, iPhones would fail to read barcodes.
  it("serve the WebAssembly the barcode reader was built for", () => {
    expect(createHash("sha256").update(read("zxing_reader.wasm")).digest("hex")).toBe(ZXING_WASM_SHA256);
  });

  it("serve the text reader's engine at the version its worker expects", () => {
    const want: string = JSON.parse(readFileSync(locate("tesseract.js/package.json", FRONTEND), "utf8")).dependencies["tesseract.js-core"];
    const have: string = JSON.parse(readFileSync(locate("tesseract.js-core/package.json", FRONTEND), "utf8")).version;
    expect(want.replace(/^[\^~]/, "")).toBe(have);
  });

  it("move to a new address whenever any of them changes, so a phone never keeps an old one", () => {
    const a = readerDir([Buffer.from("one"), Buffer.from("two")]);
    expect(a).toMatch(/^\/reader\/[0-9a-f]{12}\/$/);
    expect(readerDir([Buffer.from("one"), Buffer.from("two!")])).not.toBe(a);
  });

  it("are kept by phones for a year, compressed, with the security headers", () => {
    const conf = readFileSync(join(FRONTEND, "..", "nginx.conf"), "utf8");
    const reader = conf.match(/location \/reader\/ \{([\s\S]*?)\n {4}\}/)?.[1] ?? "";
    expect(reader).toContain("include /etc/nginx/snippets/security-headers.conf;");
    expect(reader).toContain('add_header Cache-Control "public, max-age=31536000, immutable";');
    expect(reader).toMatch(/gzip_types[^;]*text\/javascript[^;]*application\/wasm/);
  });

  it("are sent as what they are", () => {
    expect(contentType("worker.min.js")).toBe("text/javascript");
    expect(contentType("zxing_reader.wasm")).toBe("application/wasm");
    expect(contentType("eng.traineddata.gz")).toBe("application/gzip");
  });
});
