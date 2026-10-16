// Photo search (2026-10-16): a photo of a product or a shopping list is read
// on the shopper's phone, never sent anywhere. A barcode in it becomes the
// product's name (only the number goes to our server); otherwise the phone
// reads the printed words, and each line becomes something to search for.

// Big enough for small print and a barcode's bars, small enough to read fast.
export const MAX_SIDE = 2000;

/** The size a photo is drawn at: its longest side at most `max`, never enlarged. */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawn(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, max: number): HTMLCanvasElement {
  const { width, height } = fitWithin(sourceWidth, sourceHeight, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** The photo drawn upright on a canvas, at most MAX_SIDE across, for both readers to look at. */
export async function photoCanvas(file: Blob): Promise<HTMLCanvasElement> {
  // Applies the photo's own rotation, so a portrait shot isn't read sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = drawn(bitmap, bitmap.width, bitmap.height, MAX_SIDE);
  bitmap.close();
  return canvas;
}

/** What the camera sees right now, on a canvas at most `max` across. */
export function frameCanvas(video: HTMLVideoElement, max: number = MAX_SIDE): HTMLCanvasElement {
  return drawn(video, video.videoWidth, video.videoHeight, max);
}

/** A line the reader read, and how sure it was of it (0–100). */
export interface ReadLine {
  text: string;
  confidence: number;
}

// Below this, a line is usually a smudge, a shadow or a pattern read as letters.
const SURE_ENOUGH = 55;
const MAX_SEARCHES = 12;
const MAX_LENGTH = 60;
// A list's title isn't something to buy.
const HEADING = /^(?:my |our |the )?(?:(?:weekly |monthly )?(?:shopping|grocery|groceries)(?: list)?|list|to buy|things to buy)$/i;

/** What to search for, from the lines read off a photo: one per line, tidied, at most a dozen. */
export function searchesFromLines(lines: ReadLine[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (line.confidence < SURE_ENOUGH) continue;
    const text = tidy(line.text);
    const letters = text.match(/\p{L}/gu)?.length ?? 0;
    // Words, mostly: a price, a date or a row of symbols isn't something to search for.
    if (letters < 3 || letters < text.replace(/\s/g, "").length / 2) continue;
    if (HEADING.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === MAX_SEARCHES) break;
  }
  return out;
}

function tidy(line: string): string {
  return (
    line
      // Prices: "R24.99", "R 24,99", "24.99".
      .replace(/\bR\s?\d+(?:[.,]\d{1,2})?\b/gi, " ")
      .replace(/\b\d+[.,]\d{2}\b/g, " ")
      // A list's bullets, ticks, boxes and numbering: "- ", "• ", "☐ ", "1. ", "2) ".
      .replace(/^[\s\-–—•*·>□☐☑✓✔]+/u, "")
      .replace(/^\d{1,2}[.)]\s+/, "")
      // How many: "2 x milk", "3x eggs", "x2", but "2L milk" keeps its size.
      .replace(/^\d+\s*[x×]\s*/i, "")
      .replace(/^\d+\s+(?=\p{L}{3})/u, "")
      .replace(/\s*[x×]\s*\d+$/i, "")
      .replace(/\s+/g, " ")
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})%]+$/gu, "")
      .slice(0, MAX_LENGTH)
      .trim()
  );
}
