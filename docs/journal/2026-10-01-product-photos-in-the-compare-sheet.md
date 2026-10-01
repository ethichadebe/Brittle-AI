# 2026-10-01 — Product photos in the compare sheet

- **Asked for:** images on suggested items, "for a better comparison".
  Before building, three scopes were offered: suggestions only, every
  product in the sheet, or every product plus the shopper's own item. The
  answer was the recommended widest one.
- **Worked first time:** yes, apart from two layout fixes after looking at
  a screenshot.
- **Laptop needed:** no.
- **Friction:**

  - **The photos were already there, just dropped.** Every scraped
    `Product` carries an `imageUrl`; `matchItem` built its
    `ComparisonMatch` without it. Adding `imageUrl` to `ComparisonMatch`
    and to a removed product was most of the backend change. The shopper's
    own item's photo comes from the list already loaded on the page rather
    than the comparison, so a not-found item (which has no `original`) gets
    one too.

  - **The auto-applied Substitute needed a photo as much as the
    suggestions.** That's where a wrong match like chips → chutney jar would
    show at a glance, and it's why the wider scope was recommended over
    "suggestions only".

  - **Contained, not cropped.** List photos use `object-fit: cover`; these
    use `contain`, because a cropped jar and a cropped bag of chips look
    alike, which defeats the point.

  - **Two layout fixes from the screenshot.** A not-found item's photo sat
    halfway down its (tall) row and further left than the rows above it,
    which have a checkbox. Rows are now top-aligned and a not-found row
    leaves a checkbox-wide gap, so every photo sits in one column. The
    not-found item's name and photo are still dimmed; its suggestions no
    longer are, since they're the part the shopper can act on.

  - **Checked in a browser against canned responses**, the same way as
    #104, now also serving a labelled placeholder per product photo: all
    nine photos loaded on the right rows, and every pick, removal and undo
    still sent the same requests.

  - **Next:** a live look on a phone. Rows are taller, so fewer items fit on
    screen before scrolling. Worth checking that doesn't get annoying on a
    long list.
