# Error log (crashes, exceptions, Firebase, Stripe)

Record failures as they happen. Do not invent errors.

Paste stack traces or console output under **Log**. Redact secrets (Stripe secret keys, service-account JSON, ID tokens, passwords). Firebase project id is fine.

### ERR-20260825-01 — first Sign-in failed, retry succeeded

- Date (Africa/Johannesburg): 2026-08-25
- App: supplier
- Surface: Firebase Auth
- Who was signed in / role: supplier (`ebenjohn82@gmail.com`)
- Repro: intermittent (first attempt failed, immediate retry worked)
- Steps:
  1. Open live console https://knapsak-app-887fc.web.app (redirects `/` → `/login`)
  2. Sign in with Email / Password
- Expected: Sign in on first submit
- Actual (what the user saw): `Sign-in failed. Try again.` First attempt failed; retry signed in.
- Error name / code (if any): none shown beyond that UI string
- Log / stack (paste below, secrets redacted):
  Live Hosting, last deploy 19 Jul. No signup / forgot-password on `/login`. Micheal.

---

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

## Where to look (when something fails)

| Area | Typical place |
|------|----------------|
| Customer app | Flutter run console, widget/test output, Cloud Function logs for `createPaymentIntent` |
| Supplier console | Browser console, Vite terminal, Firestore permission-denied |
| POS | Browser console, Cloud Function logs for posting/till/export callables |
| Shared backend | Firebase Console → Functions / Firestore / Auth for project `knapsak-app-887fc` |
| Payments | Stripe Dashboard (test vs live) plus Function logs — never paste secret keys |
