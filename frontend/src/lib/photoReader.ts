import type { Worker as TextWorker } from "tesseract.js";
import { searchesFromLines } from "./photo";

// The two readers photo search uses, both on the phone (2026-10-16). Each is
// loaded the first time it's needed, from this site (src/build/reader.ts):
// neither is part of the app until someone takes a photo.

// The barcodes on groceries: a misread one is caught by its check digit.
const FORMATS = ["ean_13", "ean_8", "upc_a"] as const;

interface Detector {
  detect(image: HTMLCanvasElement): Promise<{ rawValue: string }[]>;
}

let detector: Promise<Detector> | null = null;

async function makeDetector(): Promise<Detector> {
  // Android's Chrome reads barcodes itself; iPhones and computers need ZXing.
  const native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (native && (await native.getSupportedFormats()).includes("ean_13")) return new native({ formats: FORMATS });
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `${__READER_DIR__}${path}` : prefix + path) } });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

/** The barcode in the photo, if there's one that can be read. */
export async function findBarcode(canvas: HTMLCanvasElement): Promise<string | null> {
  detector ??= makeDetector();
  let reader: Detector;
  try {
    reader = await detector;
  } catch (err) {
    // A failed download is tried again next time, not remembered.
    detector = null;
    throw err;
  }
  const found = await reader.detect(canvas);
  return found.find((b) => /^\d{8,14}$/.test(b.rawValue))?.rawValue ?? null;
}

let textWorker: Promise<TextWorker> | null = null;
let textReaderReady = false;

/** Whether the text reader is ready: until it is, the first photo waits for it to load. */
export const textReaderLoaded = () => textReaderReady;

/** What to search for, from the printed words in the photo. */
export async function readSearches(canvas: HTMLCanvasElement): Promise<string[]> {
  textWorker ??= import("tesseract.js").then(({ createWorker, OEM }) =>
    createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${__READER_DIR__}worker.min.js`,
      corePath: __READER_DIR__,
      langPath: __READER_DIR__,
      // The page's security policy runs workers from this site's own files only.
      workerBlobURL: false,
      gzip: true,
    })
  );
  let worker: TextWorker;
  try {
    worker = await textWorker;
  } catch (err) {
    // A failed download is tried again next time, not remembered.
    textWorker = null;
    throw err;
  }
  textReaderReady = true;
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text, confidence: l.confidence }))));
  return searchesFromLines(lines);
}

/** Lets the text reader's memory go, when the add screen closes. */
export function closeTextReader(): void {
  const worker = textWorker;
  textWorker = null;
  textReaderReady = false;
  void worker?.then((w) => w.terminate()).catch(() => {});
}
