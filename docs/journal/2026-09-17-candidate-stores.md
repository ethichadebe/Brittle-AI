# 2026-09-17 — Four candidate stores declared, none probed

- **Asked for:** add the recommended missing South African stores, structured
  like the existing ones, before moving on to Makro.
- **Worked first time:** yes, but nothing here is verified. These are candidates
  with slugs and colours, not stores.
- **Laptop needed:** no.
- **Friction:**
  - Added `ok-foods`, `usave`, `food-lovers` and `boxer`, all `active: false`.
    Each carries a comment saying what the bet is and what could kill it, so the
    next person probing one starts from the reasoning rather than the name.
  - **The colours are approximations.** I do not reliably know these brands' hex
    codes, so rather than invent precision they are brand-family guesses marked
    as unverified in the file. Three of the seven declared stores are now some
    kind of red, which means the card's name carries more weight than its colour
    — worth a look before any of them goes live.
  - `loyaltyProgramme` is `null` on all four, deliberately. Woolworths' WRewards
    was only filled in once a probe actually showed it, and a guessed programme
    name in the settings screen would be a claim the app cannot support.
  - **The SPAR lesson applies to this change itself.** SPAR was deleted yesterday
    because a permanent "coming soon" card promises something that cannot
    arrive, and this adds four cards for stores that have not been shown to have
    an online catalogue at all. The home screen now lists six unavailable stores
    against four working ones. Declaring them is still worth it — the slugs and
    the reasoning have to live somewhere, and `STORE_CONFIGS` is where the next
    reader looks — but the frontend showing every declared store is now doing
    more harm than good.
- **Next:** either gate the home screen so only probed stores appear as coming
  soon, or accept the clutter until the candidates are resolved. Makro is the
  first to be probed — issue #35.
