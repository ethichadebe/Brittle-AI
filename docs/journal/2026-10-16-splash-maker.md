# 2026-10-16 — "from Ethic Hadebe" on the opening screen

- **Asked for:** the opening splash should show that Accucery belongs to Ethic Hadebe, "similar to how Meta adds theirs in all their applications". The owner sent their logo as a picture.
- **What changed:**
  - **The new line:** the splash now ends with "from", then the logo and "Ethic Hadebe", at the foot of the screen. It fades in under the drawing A and fades out with the rest. It plays wherever the splash plays: when the installed app is opened fresh, or with `?splash` in the address.
  - **The logo:** redrawn as two shapes from the picture, by measuring its edges in a browser canvas: a grey `#cbcccb` T with two small squares, over a green `#2f9504` block. Drawn side by side, it matches the picture. Its black background isn't drawn, so the teal shows through its gaps.
- **Worked first time:** nearly.
  - The first version reused a class name, `splash-from`, that the splash already uses for the letters "rac" changing to "cer". It was caught before anything ran, and renamed `splash-maker`.
  - The built page's security policy still names the splash script by its new fingerprint, since the build computes it.
- **Laptop needed:** no.
- **Friction:** none.
