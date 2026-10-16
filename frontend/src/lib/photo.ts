import type { PhotoSearchRequest } from "@accucery/types";

// Photo search (2026-10-16): a phone photo is several megabytes; what Claude
// needs to read a label or a list is far less. Shrunk here, on the phone,
// before it's sent: faster on a slow connection, and cheaper to read.

export const MAX_SIDE = 1280;
const QUALITY = 0.8;

/** The size a photo is drawn at: its longest side at most `max`, never enlarged. */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The photo as a JPEG, shrunk and base64-encoded, ready to send. */
export async function shrinkPhoto(file: Blob): Promise<PhotoSearchRequest> {
  // Applies the photo's own rotation, so a portrait shot isn't read sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  return { image: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}
