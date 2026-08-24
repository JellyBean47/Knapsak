# Logic / design flaws

Template for issues that are not crashes: wrong totals, impossible state transitions, missing validation, confusing UX that causes bad books, or “the docs say X but the app does Y”.

Do not invent flaws. Empty sections are expected until we find real ones.

Also flag **questions** about SA VAT, POPIA, and card payments as we notice them. Those flags are questions for a SA accountant / lawyer / payment provider — not legal conclusions, and not a claim that the product is (or is not) compliant.

## Entry template

```
### LF-YYYYMMDD-NN — short title

- Date (Africa/Johannesburg):
- App: flutter | pos | supplier | cross-app
- Kind: design | state machine | money / VAT | inventory | permissions | privacy | payments | docs mismatch
- Severity: blocker | high | medium | low | question-only
- What we observed:
- Why it looks wrong (or why we are unsure):
- Expected design (from README / ARCHITECTURE / HANDOVER, if any):
- Suggested check (not a legal opinion):
- Follow-up owner:
```

---

### LF-20260825-01 — customer cart uses 8% US-style sales tax, not 15% SA VAT

- Date (Africa/Johannesburg): 2026-08-25
- App: flutter (shows up on supplier pick list / order total)
- Kind: money / VAT
- Severity: high
- What we observed: Order #G7LKITVG line is Avocado ×1 at R12.99; order total R20.02. Micheal traced the extra R7.03 to the Flutter cart: `taxRate = 0.08` plus `deliveryFee = 5.99` (8% of 12.99 = R1.04; 12.99 + 1.04 + 5.99 = 20.02).
- Why it looks wrong (or why we are unsure): 8% is US-style sales tax. POS/handover target is South Africa with default 15% VAT (retail prices VAT-inclusive). These two money models do not match.
- Expected design (from README / ARCHITECTURE / HANDOVER, if any): POS architecture: ZAR, SA VAT, default 15%, VAT-inclusive shelf prices; confirm categories/zero-rating with a SA accountant. Customer app should not be charging a separate 8% sales tax on top.
- Suggested check (not a legal opinion): Confirm with a SA accountant whether grocery delivery should be VAT-inclusive at 15%, zero-rated, or mixed — and change the Flutter cart to that model. Do not market “VAT compliant” off the current 8% rate.
- Follow-up owner: Madonna / flutter after Saturday notes; accountant sign-off before client claims.

### LF-20260825-02 — supplier pick list does not itemise tax or delivery

- Date (Africa/Johannesburg): 2026-08-25
- App: supplier
- Kind: design
- Severity: medium
- What we observed: Pick list / order detail for #G7LKITVG shows only the avocado line (R12.99) while the total is R20.02. Tax and R5.99 delivery are real in the Flutter cart, just not shown.
- Why it looks wrong (or why we are unsure): Store operator cannot see why the total is higher than the product line. Easy to treat as a math bug (we did, until Micheal traced it).
- Expected design (from README / ARCHITECTURE / HANDOVER, if any): Printable pick list / packing slip should list everything the customer paid for (items, delivery, tax/VAT).
- Suggested check (not a legal opinion): Itemise delivery and tax/VAT on supplier detail + print. After VAT model is fixed, labels must match that model (not “sales tax”).
- Follow-up owner: Micheal (supplier notes) / patch after testing

---


### LF-20260825-03 — cancelled order still shows Paid, no refund on supplier console

- Date (Africa/Johannesburg): 2026-08-25
- App: supplier (payment state from Flutter/Stripe)
- Kind: payments
- Severity: high
- What we observed: Cancelled `#1W7M7PP2` (Albany brown bread R19.99, total R27.58). Address Orania / Jaspisstraat (real street). Cancelled the same minute it was created, from Confirmed. Console still shows Paid. Note/Save disabled, no Start preparing / Cancel (correct). Print pick list still offered. Micheal did not refund or advance `#G7LKITVG`.
- Why it looks wrong (or why we are unsure): Customer was charged (Paid) then the order was cancelled; supplier UI has no refund action or “refunded” payment state. Unclear if Stripe was refunded in the background.
- Expected design (from README / ARCHITECTURE / HANDOVER, if any): Handover mentions supplier cancel with `cancelledBy: 'supplier'` and notes. Stripe refunds vs POS returns are listed as a payments question to flag. Paid + cancelled with no refund trail is a mismatch.
- Suggested check (not a legal opinion): Check Stripe Dashboard for `#1W7M7PP2` / its PaymentIntent. If still captured, supplier cancel should trigger or at least display a refund. Do not assume PCI/Stripe policy from the UI alone.
- Follow-up owner: Micheal (supplier) / Madonna (Stripe check)

### LF-20260825-01 addendum — 8% + R5.99 also on cancelled `#1W7M7PP2`

Same cart math on a second order: R19.99 + 8% (R1.60) + R5.99 delivery = R27.58. Not a one-off on the avocado order.


### LF-20260825-04 — specials banner heading hardcoded "BEST PRICE ON POOL"

- Date (Africa/Johannesburg): 2026-08-25
- App: flutter
- Kind: design
- Severity: low
- What we observed: Shop home banner title is "BEST PRICE ON POOL" while the featured card is Beacon Chocolate Slab 80g (R18.99 / was R24.99). Live catalog otherwise loaded (15 results).
- Why it looks wrong (or why we are unsure): Heading does not come from the product category. It is a leftover const from the demo pool-cleaner special.
- Expected design (from README / ARCHITECTURE / HANDOVER, if any): Banner should describe the current special, not a previous demo SKU.
- Suggested check (not a legal opinion): Drive the heading from `catalogSpecialProduct.category` / name, or use a generic "Specials" label. `lib/screens/shop/home_screen.dart:370`.
- Follow-up owner: Madonna / flutter after Saturday notes

### LF-20260825-02 addendum — Flutter order write has no tax or delivery fields

- Date (Africa/Johannesburg): 2026-08-25
- App: flutter (feeds supplier pick list)
- Kind: design
- Severity: medium
- What we observed: `FirestoreService.buildOrderData` stores `items[]` (product lines only), `totalAmount` (cart total including 8% tax + R5.99 delivery), and `deliveryAddress` string. No `tax`, `taxRate`, or `deliveryFee` fields. Confirmed in a Chrome cart/checkout walk: Avocado R12.99, Tax (8%) R1.04, Delivery R5.99, Total R20.02 — same math as #G7LKITVG. Did not place the order.
- Why it looks wrong (or why we are unsure): Supplier cannot itemise what the customer paid because the customer app never writes those lines.
- Expected design (from README / ARCHITECTURE / HANDOVER, if any): Order document should persist the same breakdown the cart shows (and later the SA VAT model).
- Suggested check (not a legal opinion): Add tax/delivery (or VAT-inclusive breakdown) on `createOrder` after the VAT model is decided. Do not invent a 15% field until then.
- Follow-up owner: Madonna / flutter

## Questions to flag as we find them (not conclusions)

Use a `question-only` entry when testing surfaces any of these. Do not fill them in until we actually hit the case.

- **SA VAT:** tax-inclusive vs exclusive shelf prices; 15% standard vs zero-rated / exempt grocery categories; input vs output control accounts; VAT201 / SARS export field mapping; legal invoice / credit-note fields. Architecture already says confirm with a SA accountant and not to market “SARS certified” without that sign-off.
- **POPIA:** what personal data the customer app, supplier console, and POS store (addresses, GPS, names, emails, order history); who can read it (customer vs supplier vs POS roles); retention; marketing use. Flag surprises; do not declare lawful/unlawful here.
- **Card payments:** Stripe on the customer app vs POS card tender vs card-clearing in the ledger; refunds / returns vs Stripe refunds; whether online settlements ever post into POS books (docs currently say they do not). Flag mismatches; do not invent PCI or banking conclusions.

## Known documented gaps (context, not filed flaws)

These are already written in the handovers as work still to do. Do not re-log them as “bugs” unless testing shows extra breakage:

- Flutter online orders do not yet post into the POS ledger / inventory
- Public `products` and POS `inventoryItems` are not one catalog
- Stripe settlements do not yet clear card-clearing / bank in the POS ledger
- POS production hosting (second Firebase site) is not configured
- Employee picker app is later
### LF-20260825-01 addendum — POS till is 15% VAT, Flutter cart is 8%
- Date (Africa/Johannesburg): 2026-08-25
- POS saVat.ts is 15 percent VAT inclusive. Flutter cart is 8 percent. Same avocado would not match a till sale.
