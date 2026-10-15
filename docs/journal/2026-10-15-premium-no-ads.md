# 2026-10-15 — Premium: no ads (#172)

- **Asked for:** #172, chosen from the list of what could be done straight away.
- **Why now:** the AdSense publisher id is already set, so Google's script was loading for everyone, Premium accounts included, while the Premium page promises "No ads". No ad units are live yet, but AdSense was still setting cookies for Premium users.
- **What changed:**
  - **At startup,** the app asks whether the account is Premium before loading AdSense, and never loads it for Premium. If it can't tell (offline, or the server busy), it loads no ads for that visit: a paying shopper must never see one.
  - **Mid-visit,** signing in to a Premium account, or finishing a subscription, stops any further ad from showing. A script already loaded can't be unloaded, but no slot asks it for an ad, and the next visit doesn't load it.
  - **Privacy notice:** now says Premium doesn't load AdSense, and is re-dated.
  - Family members on a shared list stay non-Premium, as the issue says, but sharing doesn't exist yet, so there is nothing to wire.
- **Worked first time:** yes. Loading AdSense for Premium, and showing an ad after going ad-free, were each broken on purpose, and the tests failed both times.
- **Laptop needed:** no.
- **Friction:** the local test database had stopped overnight; it was restarted and every test run again.
