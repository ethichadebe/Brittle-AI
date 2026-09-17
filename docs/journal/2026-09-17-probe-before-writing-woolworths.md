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

## Fourth round — the price is a zone, and the filter test was not a test

Dumping every key instead of guessing worked. The price fields are `p10`, `p30`
and `p60`, each with a `_wp` twin, and nothing containing the word "price" — so
no keyword list would ever have found them. They also **disagree on the same
product**: `p10` was 45.99 while `p30` and `p60` were 39.99. That is the same
class of problem as `storeContexts` in `shopriteGroup.ts`: which number is the
real price depends on where the shopper is, and picking one silently is how a
comparison app becomes confidently wrong. It is a question for a human.

The `_wp` twins were all `0` on the first result, which is a full-price item.
The probe now scans all results for one where a `_wp` is non-zero and prints it,
because that single example is what identifies the loyalty field — the same
mistake as reading `results[0]`, one level up.

The product also carries `prodtype` and `fulfiller`, both `Food` on the sample,
so the department may need no filter at all. Step [6] counts those values across
results and says plainly whether non-food is leaking.

The worse problem was that step [6] — now [8] — was not a test. It filtered by
the Food group, saw 558 before and 558 after, and concluded the filter was
ignored. But an unchanged total is *also* exactly what a working filter returns
when every result was already food. The two cases were indistinguishable and it
picked one. It now runs a second search against a non-food control group: if the
control is also unchanged the filter really is ignored, and if the control
narrows the filter works. Three outcomes are reported instead of two guesses.

Also removed: the previous filter block was left in place when the new one was
spliced in, so the script briefly had two step [6]s and made a redundant request.
Caught by running it, not by reading it.

Still no scraper code, and still nothing that activates Woolworths.

## Fifth round — ask the site where the promotions are

Socks settled the department question the other way from the previous guess:
439 results, `prodtype: Clothing` 20/20, `fulfiller: CGM`. Clothing is in the
same index after all. Food matching All for "milk" only ever meant that every
milk hit was food. So Woolworths does need a department filter, and `prodtype`
is the signal — `Food` against `Clothing`, unambiguous on both queries. `dept`
is not: it split 6115/15 within food and 129/567/585/155 within clothing, so it
is a finer category and would be the wrong thing to filter on.

The loyalty price stayed invisible. `any _wp set` came back 0/20 for milk,
coffee and chocolate. Three queries, no promotion — guessing search terms and
hoping one is on special is not a method, it is just a slower assumption. The
response has advertised an "On Promotion" facet since the first search, so step
[10] now filters by that facet and prints every promotional-looking field on a
product the site itself calls promoted. The site knows where its promotions are;
it only had to be asked.

Two bugs, both mine, both in the reading rather than the probing:

- The notes block contains the sentence "An example with `_wp` set is the
  loyalty field", and the phone-side slice was `awk '/example with _wp set/'`.
  It matched the prose, not the data, and printed the notes after every one of
  five queries. Having already made that block bracket-free to stop `sed` ranges
  re-triggering, grepping a phrase inside it was the same mistake wearing a
  different hat. The notes now print only when stdout is a terminal, so piping
  the output anywhere cannot surface them at all.
- Steps printed 9, 8, 10 because the facet step lives in the Python block and
  the filter test in the shell after it. Renumbered to match print order.

Still no scraper code.

## Sixth round — _wp is not the loyalty price

The promotion facet is `onpromo`, and asking for it returned 103 promoted
products, so the approach worked: the site says where its promotions are. What
came back killed the hypothesis.

On a product Woolworths itself flags as promoted — a long-life milk six-pack —
`p10`, `p30` and `p60` were all 126.99 and all three `_wp` fields were `0`.
**`_wp` is not the WRewards price.** Three queries had shown `any _wp set: 0/20`
and it was tempting to read that as "no promotions in this sample"; the facet
proves otherwise. Had the scraper been written on the earlier guess, it would
have reported a loyalty price of zero, or none at all, on every product.

`promo` was misread too. It is an **array of strings**, and the probe printed
`str(value)[:20]`, so the output showed `['Limited: 2 items p` — a fragment of
element one of a Python repr. The first element was a purchase limit, not a
discount at all. Arrays now print in full, wrapped, up to three elements.

Two changes make the next run decisive rather than another sample:

- The promoted results are diffed against the unfiltered ones for **keys that
  exist only on promoted products**. A promotional price must live in a field
  that is absent when there is no promotion, so no amount of looking at ordinary
  products could ever have revealed it.
- Every numeric field on a promoted product is printed, not a guessed subset.
  The last two rounds both failed because a hand-picked key list cannot contain
  a field nobody has thought of yet.

Also fixed: an empty array printed its label with nothing beneath it, which
reads as missing data rather than as empty.

Still no scraper code.

## Seventh round — the field is named, but its contents were skipped

The promoted-versus-normal key diff worked on the first try: exactly one field
exists on promoted products and nowhere else, and it is called
`product_promo_info`. That is the answer to where the promotional price lives.

The probe then failed to print it. "Every numeric field" is only every *numeric*
field, and a structured promotion is a list or an object, so the one field worth
reading was the one silently skipped. Broadening from a guessed key list to all
numerics was an improvement that still carried the original mistake: it assumed
the shape of the answer. The promoted-only keys now have their values printed in
full, whatever type they are.

Two facts did come through, and they agree with each other:

- `_wp set on 0/5 promoted` — settled. `_wp` is not the WRewards price, on
  products the site itself flags as promoted.
- The `promo` array's second element read `"Now R99.99 Save R27 Long Life Milk
  6 x 1 L"`, while `p10`, `p30` and `p60` were all 126.99. 126.99 − 27 = 99.99,
  so the regular price is `p*` and the promotional price is 99.99. The numbers
  are consistent, which is the first real corroboration of what the price fields
  mean.

That text is parseable, but parsing "Now R99.99 Save R27" out of marketing copy
is the kind of thing that works until a copywriter changes the wording. If
`product_promo_info` carries the same numbers structurally, that is what the
scraper should read.
