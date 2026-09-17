# 2026-09-17 — The probe was reading a redirect stub

- **Asked for:** probe SPAR as the fifth store.
- **Worked first time:** no, and the failure was in the probe rather than in
  SPAR. It reported that nothing answered while the site was serving fine.
- **Laptop needed:** no. One detached run on the VPS.
- **Friction:**
  - `spar.co.za` answers `/` with a **302** and a 122-byte stub. `curl` was
    called without `-L`, so the probe fingerprinted the stub, found nothing in
    it, and printed "no search page answered". The four guessed search paths
    returned 404 with **47KB** bodies — a real site's own 404 page, which is the
    detail that gave it away: a store that serves 47KB of anything is not a
    store that is down.
  - Redirects are followed now, and the landing URL is printed when it differs
    from the one asked for. For a federated chain that is not noise, it is the
    finding: where `spar.co.za` sends an anonymous visitor says something about
    whether there is one national catalogue or a region chooser.
  - Adding `%{url_effective}` to `curl -w` reintroduced a bug that had already
    been fixed once: `%{content_type}` is `text/html; charset=utf-8`, which
    **contains a space**, so a space-separated record splits it across fields.
    With two fields it silently swallowed the type; with three it put
    `charset=utf-8` where the URL should have been, and the output read
    `landed on: charset=utf-8 www.spar.co.za/spa`. The record is
    pipe-separated now, as it already was elsewhere in the same file. Two
    fields hid it; a third made it visible.
  - The curl stubs used for offline testing emitted a hardcoded
    `"%s %s" % (code, ctype)`, so they kept passing against the old format and
    broke the moment the real format changed. They parse the `-w` string now and
    substitute into it, which means a stub cannot quietly disagree with what the
    script asks curl for.
- **Not a defect:** the Hostinger web terminal on a phone cannot scroll back — a
  swipe reloads the page. Probe output is written to a file, so it is read in
  slices (`sed -n '1,20p'`) rather than scrolled. Worth remembering when
  choosing how much a command should print.
