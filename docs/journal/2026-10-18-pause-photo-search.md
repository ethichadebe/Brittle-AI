# 2026-10-18 — Pause photo search

- **Asked for:** "Let's also pause on the image taker". Decided with the owner: hide it rather than leave it live.
- **What changed:**
  - **Switch:** `PHOTO_SEARCH_ON` in `frontend/src/lib/photo.ts`, now `false`. The add screen shows the camera button, the photo picker and the scanner only while it's on.
  - **Kept as it is:**
    - the scanner;
    - the readers served under `/reader/`, which only download when used;
    - the barcode lookup route;
    - the privacy notice's Photos section, which stays true.
  - Setting the switch to `true` brings it all back.
- **Worked first time:** yes.
  - `AddItems.test.tsx` renders the add screen and checks the camera and picker show only while the switch is on.
  - Showing the camera regardless failed the test.
- **Laptop needed:** no.
- **Friction:**
  - On the owner's Android phone, words on a glossy, angled pack read poorly.
  - Open Food Facts knows few South African barcodes.
  - Both are reasons the feature isn't ready for shoppers yet.
