# Error log (crashes, exceptions, Firebase, Stripe)

Template only. Record failures as they happen. Do not invent errors.

Use one section per incident. Paste stack traces or console output under **Log**. Redact secrets (Stripe secret keys, service-account JSON, ID tokens, passwords). Firebase project id is fine.

## Incident template

Copy the blank block below for each new incident.

### ERR-YYYYMMDD-NN — short title

- Date (Africa/Johannesburg):
- App: flutter | pos | supplier | functions
- Surface: UI crash | uncaught exception | Firebase Auth | Firestore rules | Cloud Function | Stripe | hosting / deploy
- Who was signed in / role: customer | supplier | posRole (owner/manager/cashier/accountant) | anonymous | n/a
- Repro: always | intermittent | once
- Steps:
  1.
  2.
- Expected:
- Actual (what the user saw):
- Error name / code (if any):
- Log / stack (paste below, secrets redacted):

---

### ERR-YYYYMMDD-NN —

- Date (Africa/Johannesburg):
- App:
- Surface:
- Who was signed in / role:
- Repro:
- Steps:
  1.
- Expected:
- Actual (what the user saw):
- Error name / code (if any):
- Log / stack (paste below, secrets redacted):

---

## Where to look (when something fails)

| Area | Typical place |
|------|----------------|
| Customer app | Flutter run console, widget/test output, Cloud Function logs for `createPaymentIntent` |
| Supplier console | Browser console, Vite terminal, Firestore permission-denied |
| POS | Browser console, Cloud Function logs for posting/till/export callables |
| Shared backend | Firebase Console → Functions / Firestore / Auth for project `knapsak-app-887fc` |
| Payments | Stripe Dashboard (test vs live) plus Function logs — never paste secret keys |

## Prompt for testers

If it crashed, failed to pay, or Firebase rejected a write: fill a section above. Empty templates are expected until we hit a real failure.
