# 2026-09-20 — What the review of the last few days' diff turned up

- **Asked for:** `/code-review` then `/simplify` over `2ea7382..HEAD`.
- **Worked first time:** yes, but two of the four findings I acted on were in
  work from *this* session, not the older diff.
- **Laptop needed:** no.
- **Friction:**

  - **`fillImageTemplate` leaked any placeholder with a digit or an
    underscore.** The catch-all was `\{@[A-Za-z]+\}`, so `{@quality_2x}`,
    `{@w2}` and `{@2x}` went through untouched and reached `Product.imageUrl`
    as literal braces, which is a guaranteed 404. Latent rather than live —
    Makro's known placeholders are all letters — but this is the second image
    bug on this store, and the first one also shipped because nothing had
    printed the real value.

  - **The test that should have caught it was named as though it had.** Its
    title was "leaves no placeholder behind, whatever its name" and it
    exercised exactly one name, `{@unknown}` — letters-only, the single shape
    the broken regex *did* handle. A test whose name claims more than its
    assertions check is worse than no test, because it answers the question for
    the next reader. It is now `it.each` over six names, five of which fail
    against the old regex. Confirmed by putting the old regex back.

  - **Dropping a whole-segment placeholder left `//`.** Same class of problem
    and the same reasoning the existing comment already used one line up: a
    collapsed path might resolve, a doubled slash certainly will not. Collapsed,
    with the scheme's own `//` protected by requiring a non-`:` before the
    match — and a test asserting the URL still starts `https://`, because that
    is the thing a careless fix breaks.

  - **`CLAUDE.md` still named one backend test command.** The split shipped
    earlier today gave the repo `test:unit` and `test:db`, and the check-list a
    contributor follows never mentioned them — so the one command it does name
    is the one that fails without a database. My omission, from my own change.

  - **`smoke-scrapers.sh` cried wolf about loyalty prices.** It printed "no
    loyalty prices seen (issue #7)" whenever the count was zero, whatever it had
    searched. Makro's `loyaltyProgramme` is deliberately `null` — its Special
    Price is a public promotion, not a card-gated one — so a run over Makro
    reported the warning every single time, which turns a real signal into
    noise. It now reads which stores have a programme from `STORE_CONFIGS`, the
    same source Settings lists, rather than carrying a second list to keep in
    step, and names which store was expected to show one. A config it cannot
    read or parse says so instead of guessing: warning would be the false alarm
    again, staying silent would hide issue #7.

  - **That script had no test at all, so it got one.** `curl` is stubbed on
    `PATH`, so it runs offline against a canned response with no app, no store
    and no ScraperAPI credits — the first time this script could be checked
    without a live deployment. Three mutations, each caught: stop stripping
    `//` comments and Makro's own comment makes it look loyalty-capable; always
    claim the config was readable and the unreadable case goes unreported; drop
    the no-card branch and the false alarm returns.

  - **Not changed: `probe-store.sh`'s bot-defence heuristic.** It matches
    `hcaptcha|recaptcha/api\.js` anywhere on a homepage, so a captcha on an
    unrelated footer form would report a store as needing a real browser when
    its catalogue API is open. That is a fair reading of the code. But every
    wrong call in this repo's recent history came from tuning a heuristic
    against something other than the real page, the fixtures here are invented
    by design, and the standing instruction is not to add stores — so the
    verdict is not currently load-bearing. Raised rather than guessed at.

  - **Two findings in `.github/workflows/deploy.yml` were left for the user**,
    since `CLAUDE.md` fences that directory off unless the request is about the
    pipeline: its header still says the workflow "must not run until the updated
    dispatcher is installed on the VPS", which stopped being true when the
    2026-09-20 deploy succeeded; and it has no `paths:` filter, so a
    journal-only commit triggers a full two-image build.
