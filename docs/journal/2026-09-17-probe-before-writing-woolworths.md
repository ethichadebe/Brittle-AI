# 2026-09-17 — Ask Woolworths before writing its scraper

- **Asked for:** a fourth store scraper, with the store chosen from the four
  declared-but-inactive slugs, and a probe script written before any scraper
  code. Woolworths was picked: it is the fourth big grocer, so it is the one
  that makes a grocery price comparison more complete.
- **Worked first time:** no code yet, deliberately — same as the Shoprite probe
  the day before. But the script itself did not work first time, and the way it
  failed is the point: see Friction.
- **Laptop needed:** yes, for running it. This session cannot reach
  woolworths.co.za, so the probe gets run on the VPS and its output pasted back.
- **Friction:**
  - `probe-shoprite.sh` was a *confirmation* probe — Checkers and Shoprite are
    one company on one platform, so it could ask a known endpoint a yes/no
    question. Woolworths is neither Shoprite Holdings nor on Pick n Pay's
    Constructor.io, so there is no endpoint to confirm. This one had to be a
    *discovery* probe: find what the site runs, then measure it against the two
    parsers that already exist. Copying the Shoprite probe's shape would have
    produced a script that could only ever answer "no".
  - The interesting question is still field names, not whether an API exists.
    So step [5] checks a captured response against what `shopriteGroup.ts`
    `normalise()` actually reads — treating `imageProductCardURL`/`imageURL` as
    alternatives and `bonusBuy` as optional, because that is what the code does.
    An earlier version scored a raw 6 fields and called a working shape 5/6.
  - Three bugs were found by running it against stub responses rather than by
    reading it, which is why the stubs were worth writing:
    - `curl`'s `%{content_type}` is `text/html; charset=utf-8` — it contains a
      space. The space-separated record split it across three variables, so
      `bytes` became `charset=utf-8` and every search-page check silently
      failed. Records are pipe-separated now.
    - The ScraperAPI credit counter incremented inside `$( )`, so it died with
      the subshell and reported 0 after spending 3. Under-reporting spend on a
      metered free tier is the worst direction to be wrong in; the counter is a
      file now.
    - A WAF-blocked request that then succeeded through the proxy reported
      "WAF: no sign of one", because the check re-read the proxy's reply.
      Whether Woolworths needs a residential proxy is one of the four things
      this probe exists to answer, so it now reports the direct attempt.
  - Credits: every step tries the direct IP first, which is free, and only falls
    back to ScraperAPI for a step the WAF actually blocked, capped at three and
    printed. The baseline in step [1] is Pick n Pay rather than Checkers —
    Checkers would have cost a credit just to prove the network works.
  - Output is kept under 40 columns like `smoke-scrapers.sh`, since the result
    gets read and pasted from a phone. Content types are shown as `json`/`html`
    tokens rather than truncated mid-word to stay inside that.
  - Backend tests were not run: no Postgres in this session, and it fails in
    `globalSetup.ts` before any test file loads. Nothing here touches
    TypeScript. Everything else in the CLAUDE.md list was run and is green.

## Second round — what the VPS actually returned

The probe was run on the VPS and answered three of its four questions:

- **No WAF.** Woolworths served 1.65MB of HTML to the VPS's own datacenter IP,
  directly, HTTP 200. It needs no residential proxy, so it costs **zero**
  ScraperAPI credits per search. That is a real difference from Checkers and
  Shoprite, and it was worth knowing before any budgeting.
- **Not the Checkers platform.** `/api/catalogue/get-products-filter` returned
  no JSON, so `shopriteGroup.ts` is out. Expected — different company — but now
  measured rather than assumed.
- **It runs Constructor.io**, the same search platform as Pick n Pay.

That last one the probe very nearly hid. The fingerprint list checked for the
literal `ac.cnstrc.com`; Woolworths references the bare `cnstrc.com`, so the
report printed **"none recognised"** while the host list two lines below showed
`cnstrc.com` plainly. The single most valuable thing the probe could find, and
it said "no idea". The check is a substring now. Two smaller defects went with
it: the api-path list truncated *after* de-duplicating, so four distinct paths
collapsed into four identical-looking lines and wasted most of the slots; and
the host list was capped at eight in alphabetical order, which silently drops
anything late in the alphabet.

`probe-woolworths-search.sh` is the follow-up, and it exists because "same
platform as Pick n Pay" is not the same claim as "same fields as Pick n Pay" —
which is the exact shape of the assumption that cost this project four months.
It finds Woolworths' own Constructor key (in the HTML, or in a frontend bundle
as Pick n Pay's is), searches with it, and counts `pnp.ts` `normalise()`'s
fields against the response.

Its own bug, found by stub rather than by reading: field names were read off
`results[0]`. A loyalty price only exists on promotion items, and result zero
was full-price, so `wRewardsPrice` and `oldPriceValue` did not appear in the
output at all — the probe would have under-reported the one field the app is
for. Fields are now counted across every result, with coverage (`20/20`) rather
than yes/no. A related miss: the price-key filter matched `save` but Woolworths'
field is `savingValue`, which does not contain it. Matching `sav` now.

The other reason it is a second script: Woolworths is not only a grocer. It
sells clothing, beauty and homeware from the same search index, so a query for
milk can return a shirt. `STORE_CONFIGS` has no notion of a department — every
store so far has been a grocer end to end — and a clothing item leaking into a
price comparison is silently wrong rather than visibly broken. Step [4] asks how
Food is expressed (a Constructor group, or something else) instead of guessing.
No scraper code until that is read.

## Third round — the platform matches, the prices do not

The search probe ran on the VPS and the key worked: 558 results for "milk".
Woolworths is on Constructor.io, same as Pick n Pay. But the fit is partial in
the way that matters:

- `value`, `data.id`, `image_url` — 20/20 each. Identity is identical to PnP.
- `data.priceValue` — **0/20**. `priceConditionType` and `promotionDisplayType`
  never appear. So `pnp.ts` `normalise()` scores 3/4: same platform, same fetch,
  entirely different pricing vocabulary.

The useful part was a negative result. The probe lists keys matching guessed
words — price, promo, reward, loyal, sav, discount — and returned only
`bulkpromo` and `promo`. **Not one key contained "price".** The price is under a
name nobody guessed, which is precisely why guessing was the wrong method. Step
[5] now dumps every key and every scalar value on the first result, plus the
`variations` keys, instead of filtering by a word list. Constructor commonly
carries per-variant pricing, so that is the first place it will show up.

The department answer was worse than unknown — it was wrong and confident. Step
[4] printed `results in Food: 0/20` and then `-> filter by group_id`, which do
not agree. Results carry leaf categories (`cat866912`, `cat858521`) while Food
is `cat606520`, so membership was never the right test; it is an ancestry
question. The conclusion line was unearned and is gone. Step [6] asks the server
instead — it re-searches with `filters[group_id]` and reports whether the total
narrows. Narrowing is evidence the server understands the department; an
unchanged total means the filter was ignored and Food lives somewhere else.

Also worth recording because it wasted three screenshots: the closing notes
block had lines beginning `[3]` and `[4]`, and slicing the output on a phone
with `sed -n '/^\[3\]/,/^credits/p'` re-triggered the range on those lines and
printed to end of file, pushing the real answer off the top twice. No line in
that block starts with a bracket now.

Still no scraper code. Nothing in this pull request activates Woolworths:
`STORE_CONFIGS` is untouched, no scraper is registered, and merging it deploys
nothing that runs.
