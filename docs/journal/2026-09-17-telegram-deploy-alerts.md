# 2026-09-17 — The notification channel already existed

- **Asked for:** "Why isn't this also using the telegram bot to send the
  notifications?"
- **Worked first time:** no, and not in an interesting way. The first test run
  reported no channels configured because the harness put the script at a
  directory root, so `REPO_DIR` (`dirname/..`) resolved one level too high and
  never found `.env`. Fixed the harness, not the script.
- **Laptop needed:** no. The real Telegram API cannot be reached from here, so
  the calls were pointed at a local stand-in that printed what arrived. The
  endpoint itself is only proven by `--test-notify` on the box.
- **Friction:**
  - The answer to the question is that I did not look. `ethichadebe/workflows`
    has had a Telegram alerting path all along — `monitor.yml` checks the live
    sites every fifteen minutes and messages the same bot on failure. Building a
    second channel without reading it was the same mistake as building a deploy
    without reading that repo's Destination mechanism, twice in one session.
  - Telegram is preferred where configured; `ACCUCERY_NOTIFY_URL` still works and
    both can be set at once. Telegram has no title or priority, so the outcome
    leads the message, and `disable_notification` keeps a successful deploy from
    buzzing while still leaving it in the chat.
  - It puts the bot token on the server as well as in Actions secrets. The token
    can only send messages as the bot, but it is one more place to rotate.
  - Worth knowing: `monitor.yml` already alerts if the site goes down. What it
    cannot see is a deploy that failed while the old containers kept serving —
    green site, stale code, nobody told. That is the case this covers.
- **A real defect shipped yesterday.** The topic generator in `.env.example` was
  `head -c 9 /dev/urandom | base64 | tr -dc a-z0-9`. Stripping the uppercase and
  punctuation out of base64 leaves a *variable* number of characters: measured
  over 200 runs it produced between 2 and 11, and the topic actually generated on
  the server was four. Four characters from `[a-z0-9]` is 36^4, about 1.7 million
  — brute-forceable against a public service whose topic name is its only
  protection. Replaced with `tr -dc 'a-z0-9' < /dev/urandom | head -c 24`, which
  measured 24 characters in 200 of 200 runs. The weak topic needs rotating on the
  server; generating a new one is all it takes.
