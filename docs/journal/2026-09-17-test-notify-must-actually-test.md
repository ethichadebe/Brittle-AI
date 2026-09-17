# 2026-09-17 — A test that reports success it never saw

- **Asked for:** "I did not receive any notification" — after `--test-notify`
  had just printed `Sent two test notifications via Telegram`.
- **Worked first time:** no, twice over, and the second one is the real defect.
- **Laptop needed:** no.
- **Friction:**
  - The immediate cause was mine: the instructions were a copy-pasteable block
    containing `TELEGRAM_BOT_TOKEN=...`, and `...` was pasted as the value. A
    block that can be pasted whole will be, so the block now prompts for the two
    values with `read` instead of containing placeholders, and hides the token
    from the screen while typing.
  - The real defect: `--test-notify` reported success without checking. The
    `|| true` around the curl is right for a deploy — a notifier must never be
    able to fail one — but wrong for the one command whose entire purpose is to
    prove alerts work before they are needed. It now reports the HTTP code it
    actually received, maps the common ones, and exits 1 when nothing was
    delivered. 404 means the token, 400 usually means the chat id, and Telegram's
    own `description` says which.
  - It also refuses outright when `.env` still holds a literal `...`, echoing the
    offending lines truncated to four characters. That is the failure that just
    happened; it should not be able to happen silently again.
  - The stand-in server caught a fragility the real API would have hidden: the
    description was extracted with `"description":"` and Python's `json.dumps`
    emits `"description": "`. Telegram sends compact JSON, so this would have
    worked in production and broken silently the day anything reformatted it.
    The pattern now tolerates whitespace around the colon.
  - Checked that a deploy still survives a broken notifier: with a bad token, a
    failing deploy logged its failure and exited in zero seconds.
