# 2026-10-14 — An encrypted copy of each night's backup on Google Drive (#154)

- **Asked for:** "can we send the backups to a Google Drive?" The host's backups are weekly, so losing the server could cost up to a week of data. The nightly dumps sit on the same disk as the database.
- **What changed:**
  - **`accucery-backup` can copy each good dump off the server** through rclone (Ubuntu's package). It checks the copy's size there, keeps 30 days, and only ever removes its own files.
  - **A failed upload fails the night** (for the alert, #155) but never touches the local dump. A failed dump is never uploaded, and pruning only runs after a good upload.
  - **The remote is set in `/etc/default/accucery-backup`,** read as plain text and never run. So a backup run by hand behaves exactly as cron's does.
  - **`docs/backups.md`** covers connecting Drive with the narrowest permission (`drive.file`, only rclone's own files), encrypting with an rclone `crypt` remote whose password only the owner keeps, and getting the data back on a new server.
- **Worked first time:** yes. The stand-in rclone tests passed at once, and breaking each guard on purpose failed a named test:
  - dropping the size check;
  - pruning before the upload;
  - ignoring the settings file.

  The real rclone 1.60.1 (the version Ubuntu 24.04 ships) was also run end to end, with a local folder in place of Drive:
  - names and contents were scrambled there;
  - a fresh setup holding only the password listed, downloaded and restored the copy;
  - a wrong password listed nothing.

  The one-line Drive setup was checked to run without prompts.
- **Laptop needed:** briefly. Google's sign-in for rclone needs a browser, so one `rclone authorize` runs on the owner's PC; everything else is on the server.
- **Friction:** none in the code. The one decision was where the password lives: only with the owner, never on the server alone and never in the same Google account.
- **Setting it up live (same day):** done from a phone and a Windows PC, in five steps. The first Drive copy went up encrypted: `off-site ok: copied to accucery-drive:, 1 kept there`. One step went wrong, and the fault was in the docs:
  - The Windows rclone, a current one, printed its settings base64-encoded rather than a bare token. The server's 1.60 refused it (`invalid character 'e'`).
  - rclone's own source (`fs/config/authorize.go`, `configmap.Simple.Encode`) showed the format: the token plus the client id and secret it was issued for. A token alone would have stopped renewing after an hour.
  - The fix was a short Python block that unpacks all three into the server's config. It was tested here against a blob made in that exact format (same leading characters as the owner's), then worked first time on the server. `docs/backups.md` now gives that block.
  - The same source says rclone's shared Google client id is being retired during 2026. The docs say what a failed Drive copy would look like, and how to switch to a client id of your own without touching the encryption.
