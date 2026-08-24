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

### LF-YYYYMMDD-NN —

- Date (Africa/Johannesburg):
- App:
- Kind:
- Severity:
- What we observed:
- Why it looks wrong (or why we are unsure):
- Expected design (from README / ARCHITECTURE / HANDOVER, if any):
- Suggested check (not a legal opinion):
- Follow-up owner:

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
