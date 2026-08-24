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
