# 2026-10-16 — Photo search, free and on the phone

- **Asked for:** "this thing will just cost me more, can't we find a free alternative?" The first version (#191) paid Claude to read each photo.
- **Decided with the owner:** free, on the phone. Barcodes are looked up in Open Food Facts, and printed words are read by Tesseract on the phone. Handwriting reads poorly, which is the trade for no cost. No cost means no sign-in needed: everyone gets the camera.
- **What changed:**
  - **Taken out:** the Claude reader, `POST /search/photo`, the Anthropic SDK, `ANTHROPIC_API_KEY`, the photo limits, and Anthropic in the privacy notice.
  - **Camera button** beside the search box, for everyone. A photo is drawn upright at up to 2000 px, then:
    1. **Barcode first.** Android's Chrome has its own barcode reader. Anywhere else, ZXing (WebAssembly) reads it. Only EAN-13, EAN-8 and UPC-A, the ones on groceries.
    2. **Known barcode:** `GET /products/barcode/:code` asks Open Food Facts from our server and answers the name plus size ("Coca-Cola 330 ml"). That fills the search box.
    3. **No barcode, or one Open Food Facts doesn't know:** Tesseract reads the words. Each line, tidied, becomes a chip; the first is searched.
       - Tidying removes bullets, ticks, numbering, "2 x", prices, the list's title, and lines it wasn't sure of.
       - Sizes like "2L" are kept.
  - **The photo never leaves the phone.** Only a barcode's number goes to our server.
  - **Server route:**
    - The check digit must add up, or it answers 400 without asking anyone.
    - Limited to 60 lookups an hour per device and 300 per IP.
    - Answers are remembered: a week for found, a day for not found.
    - Open Food Facts down gives a 502 "try again".
    - It sends the identifying User-Agent Open Food Facts asks for.
  - **Readers served from our own site**, under `/reader/<fingerprint>/`, built by `frontend/src/build/reader.ts`:
    - nginx keeps them a year and compresses them.
    - They download only on the first photo: about 0.5 MB for ZXing (not on Android), and about 4.6 MB for Tesseract (only when there are words to read).
  - **Page security policy** gains `'wasm-unsafe-eval'`, which lets WebAssembly compile and still blocks `eval()`.
  - **Privacy notice:** a Photos section, plus Open Food Facts in "Who else handles it"; re-dated.
  - **New dependencies (frontend):**
    - `tesseract.js`, which reads text;
    - `@tesseract.js-data/eng`, its English model, so it's served from our site and not a CDN;
    - `barcode-detector`, the standard barcode API, backed by ZXing, for phones without one built in.
- **Worked first time:** mostly. Checked in a real browser against the built app behind the real nginx config:
  - A barcode photo filled "Coca-Cola 330 ml".
  - A printed list became six chips, with no requests off our site.
  - An unknown barcode under "Jungle Oats" fell back to reading the pack.
  - A stand-in for Android's built-in reader loaded no reader files at all.
  - Fixed after the first run: the list's title, "Shopping list", came out as the first search, so titles are now left out.
  - Broken on purpose, each caught:
    - without `'wasm-unsafe-eval'`, the browser refused ZXing;
    - a wrong check-digit rule, no remembering, no User-Agent, no limit and no code check each failed a test.
- **Laptop needed:** no.
- **Friction:**
  - Open Food Facts knows few South African barcodes. Of three tried, two were unknown and one came back under its French name. That's why the pack's words are read when a barcode isn't known.
  - Store searches can't be reached from a cloud session, so the searches themselves said "No products found".
