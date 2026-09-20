# 2026-09-20 — Retire the timer deploy

- **Asked for:** remove `scripts/auto-deploy.sh`,
  `deploy/accucery-deploy.service` and `deploy/accucery-deploy.timer`, and hand
  over the `systemctl disable --now` command. The precondition — the
  compose-destination path succeeding once — was met on 2026-09-20.
- **Worked first time:** yes.
- **Laptop needed:** no. One command on the VPS, from a phone.
- **Friction:**

  - **The timer was disabled before the files were removed, and that order
    matters.** The timer fired every ~70s against `/opt/accucery`, so the first
    tick after this merge would have found `master` moved, fast-forwarded the
    checkout, and then run a script that no longer exists. Turning it off first
    makes the removal a no-op on the box rather than a failure. Confirmed on the
    server: the `timers.target.wants` symlink removed, `disabled`, `Active:
    inactive (dead)`.

  - **The `.service` unit had no `[Install]` section**, so nothing else could
    have started it. Worth checking rather than assuming — a `oneshot` service
    with an install target would have survived the timer being disabled.

  - **Three files were named; four had to go.** `deploy/README.md` was entirely
    about the retired mechanism, and its last instruction is
    `systemctl enable --now accucery-deploy.timer` — following it would have
    re-armed exactly the race this change removes. Deleting the units and
    leaving their README is worse than leaving both.

  - **Two other places were left describing a path that no longer exists**, both
    found by grepping for the removed names rather than by remembering:
    - `README.md` said a merge is picked up "within a minute" by the timer, and
      offered `docker compose up -d --build` as the manual fallback. That
      command cannot work now: `docker-compose.prod.yml` has no `build:` blocks
      at all, only `image: ${BACKEND_IMAGE}`. Checked, not assumed.
    - `.env.example` advertised `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and
      `ACCUCERY_NOTIFY_URL`. `auto-deploy.sh` was their only reader in the repo.
      The new path still sends the same Telegram message, but from
      `compose-deploy.yml` using this repository's **Actions secrets**, not the
      box's `.env` — read out of the workflows repo rather than guessed.
      `ACCUCERY_NOTIFY_URL` has no equivalent on the new path and is now read by
      nothing.

  - **The ntfy option is gone, not moved.** Recording that plainly because the
    old README argued for it at length and someone may come looking. If deploy
    alerts to a phone matter beyond Telegram, that is a new change against
    `compose-deploy.yml` in the workflows repo, not something this repo can
    configure.

  - **A review of the wider diff found one more, in this pull request's own
    blind spot.** `README.md` step 4, *Start the stack*, still said
    `docker compose up -d --build` and claimed it "Builds the backend / Builds
    the frontend". The Updating section below it had been corrected; the
    first-time-setup section forty lines above had not, and it gave the same
    impossible command with more confidence. Fixed here rather than left for a
    follow-up, since it is the same defect this change exists to remove.
  - **Where `BACKEND_IMAGE` and `FRONTEND_IMAGE` come from was worth checking
    rather than asserting.** They appear in `docker-compose.prod.yml` and
    nowhere else in the repo, which reads like an omission. It is not: the
    workflows repo's `compose-destination.md` says the dispatcher "sets those
    two values in the app's `.env` at Cutover, and keeps the previous ones so it
    can put them back." So they are machine-written, `docker compose exec` and
    `logs` on the box work normally, and adding them to `.env.example` would
    invite someone to pin an image by hand. Said so in the README instead.
