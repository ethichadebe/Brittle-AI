import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

// Photo search (2026-10-16) reads barcodes and printed text on the shopper's
// phone, so a photo never leaves it. The readers (Tesseract for text, ZXing
// for barcodes where the phone has no barcode reader of its own) are served
// from this site rather than a CDN: the page's security policy allows only
// its own files, and nobody else learns who is reading what.
//
// They live under /reader/<fingerprint>/, the fingerprint of all of them
// together, so a new version of any is a new address and nginx can let
// phones keep them for a year: they're downloaded once, on first use.

/** Served name → where it is in node_modules. */
export const READER_FILES: Record<string, string> = {
  // Tesseract's worker, and its engine in the three builds it picks between
  // by what the phone's processor can do (newest first).
  "worker.min.js": "tesseract.js/dist/worker.min.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js": "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js": "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-lstm.wasm.js": "tesseract.js-core/tesseract-core-lstm.wasm.js",
  // English, the smaller of the two models, the one its fast engine uses.
  "eng.traineddata.gz": "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  "zxing_reader.wasm": "zxing-wasm/dist/reader/zxing_reader.wasm",
};

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
};

export const contentType = (name: string) => CONTENT_TYPES[name.slice(name.lastIndexOf("."))] ?? "application/octet-stream";

/** Where a package file is: the frontend's own node_modules, else the workspace's. */
export function locate(file: string, frontendDir: string): string {
  for (const dir of [join(frontendDir, "node_modules"), join(frontendDir, "..", "node_modules")]) {
    const path = join(dir, file);
    if (existsSync(path)) return path;
  }
  throw new Error(`reader: ${file} isn't installed; run npm ci at the repo root`);
}

/** /reader/<fingerprint>/, from the files' contents. */
export function readerDir(contents: Buffer[]): string {
  const hash = createHash("sha256");
  for (const c of contents) hash.update(c);
  return `/reader/${hash.digest("hex").slice(0, 12)}/`;
}

/** Serves the readers in dev, copies them into the build, and tells the app where they are (__READER_DIR__). */
export function reader(frontendDir: string): Plugin {
  const files = Object.entries(READER_FILES).map(([name, file]) => ({ name, path: locate(file, frontendDir) }));
  const dir = readerDir(files.map((f) => readFileSync(f.path)));
  return {
    name: "accucery-reader",
    config: () => ({ define: { __READER_DIR__: JSON.stringify(dir) } }),
    configureServer(server) {
      server.middlewares.use(dir, (req, res, next) => {
        const file = files.find((f) => `/${f.name}` === req.url);
        if (!file) return next();
        res.setHeader("Content-Type", contentType(file.name));
        res.end(readFileSync(file.path));
      });
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: "asset", fileName: `${dir.slice(1)}${f.name}`, source: readFileSync(f.path) });
    },
  };
}
