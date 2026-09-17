# 2026-09-17 — Stop relaying terminal output by hand

- **Asked for:** "update our workflow and journal so that it finds a way for all
  the applications in my repo to have access to things that will assist with
  automation."
- **Worked first time:** yes, but only because the fixture came before the
  script was ever run for real. Four bugs were caught offline that would each
  have cost a round trip — see below.
- **Laptop needed:** no.
- **Friction:**
  - **The number that prompted this.** Shipping the Woolworths and Makro
    scrapers took roughly thirty rounds of a person copying terminal output from
    a phone into a chat window. A large share of those carried no decision at
    all: the agent needed to *see* something and a human was the only wire.
    Several were my own fault — I shipped probe-display changes without testing
    them against a realistic fixture first, and each bad one cost a round trip.
  - **The constraint is real and now tested, not assumed.** A cloud session
    cannot reach the VPS: no SSH credentials, and the egress proxy refuses even
    HTTPS to this app's own domain (`connect_rejected`, organisation policy).
    It cannot reach the store sites either. That is written down in
    `docs/agents/automation.md` so the next session does not re-discover it by
    trying.
  - **What shipped.** `scripts/report.sh` runs a command on the VPS and posts
    its output as a comment on a GitHub issue. Two steps become one: run it
    there, the agent reads the issue. Plus `docs/agents/automation.md`, a
    CLAUDE.md section, and a `GITHUB_REPORT_TOKEN` line in `.env.example`.
  - **The repository is public**, which decided the whole design. Anything
    posted is world-readable and permanent. Earlier the same day a probe printed
    `SCRAPERAPI_KEY` into its own output — through the proxy, `%{url_effective}`
    is the ScraperAPI URL with the key as a query parameter — on a script whose
    own header said "Prints no secrets". Nobody intended it and nothing caught
    it. So: every `.env` value of 8+ characters masked whatever its key is
    called, credential shapes masked even when absent from `.env`, and an
    outright refusal to post if anything still looks like a private key or a
    token. The token itself is scoped to Issues on this one repository, not
    Contents — a comment-only token cannot become a deploy.
  - **Four bugs the fixture caught before anyone ran it.** The truncation notice
    was appended to the file *before* the byte count cut it off, so it could
    never appear. The markdown fence was three backticks, so any output
    containing a code fence would have escaped it and posted the rest as prose.
    The token was passed with `-H` on curl's command line, visible in this box's
    process table to any other local user. And the response landed at a fixed
    `/tmp/report-resp.json`. None would have shown up in a first live run; the
    fence one would have quietly mangled exactly the probe output this exists to
    carry.
  - **Then the tests were checked by breaking the script.** Seven mutations —
    delete the `.env` masking, delete the shape masking, disable the refusal
    gate, put the token back on the command line, drop the `$$` unescaping,
    reinstate the truncation bug, fix the fence at three backticks — and each
    failed naming the right thing. One case did *not* bite: the quoted-`.env`
    value test still passed with masking removed, because its value happened to
    match a shape rule too. It was testing nothing. Changed to a value no shape
    rule catches, and re-verified. That is the whole point of the exercise: a
    test that passes against a broken script is worse than no test.
  - **The fixtures themselves tripped the secret scanner.** Six findings, all
    in the test file — including `stripe-access-token`, because the fake key I
    planted was `sk_live_…`. That is not a false positive: a value shaped like
    a real credential is a finding whether or not it is one, and the fix
    CLAUDE.md asks for is to change the value, not to widen `.gitleaks.toml`.
    Swapped for low-entropy sentinels (`planted-aaaaaaaaaaaa`), re-scanned
    clean, and re-ran the masking mutation to confirm the swap had not made the
    test vacuous. Worth saying out loud: allowlisting those six would have
    taught the next reader that this scanner cries wolf.
  - **Left undone, deliberately.** CI runs nothing from `scripts/`, so
    `report.test.sh` only runs when someone remembers, and it will rot. Wiring
    it into `.github/workflows/ci.yml` needs a change request that is explicitly
    about the pipeline, per CLAUDE.md, so it is raised rather than smuggled in
    here.
  - **The rule this is really about**, now in `docs/agents/automation.md`: when
    the only way to see a result is another person's terminal, the cost of
    shipping an untested version is not one round trip, it is their attention.
    Build the fixture first.
