# Knapsak Supplier

PC web console for store operators — live orders from Firebase, status updates for dispatch.

## Stack

- Vite + React + TypeScript
- Firebase Auth + Firestore (project `knapsak-app-887fc`)
- Supplier access via custom claim `role: 'supplier'`

## Setup (local)

```bash
cd ~/Desktop/knapsak_supplier
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Deploy (Firebase Hosting)

```bash
cd ~/Desktop/knapsak_supplier
npm run deploy
```

After deploy, open the Hosting URL from the Firebase Console (typically  
`https://knapsak-app-887fc.web.app`). Bookmark it on the store PC.

## Features

- Live order list with status filters
- Search by order ID, address, or product name
- Date range filter (+ Today shortcut)
- New-order chime, tab badge `(N)`, banner with Open, and optional desktop notifications
- Mute sound from the top bar (preference saved in the browser)
- Printable pick list / packing slip
- Keyboard shortcuts on order detail: `A` / `Enter` advance · `P` print · `Esc` back
- Supplier issue notes + cancel (stock-out) before delivered

## Grant supplier access

1. Create a Firebase Auth user (email/password) in the Firebase Console, or have them sign up via the customer app once.
2. From the customer app repo:

```bash
cd ~/Desktop/knapsak_flutter/scripts
node set-supplier-role.js supplier@example.com
```

3. Sign out / sign in on the supplier console so the ID token picks up the claim.

Additional suppliers (after the first):

- Call the `setSupplierRole` Cloud Function while signed in as an existing supplier, or
- Run the same bootstrap script again.

## Related Firebase config (customer app repo)

Rules and Cloud Functions live in `~/Desktop/knapsak_flutter`:

```bash
cd ~/Desktop/knapsak_flutter
firebase deploy --only firestore:rules,functions --project knapsak-app-887fc
```

## Status flow

`pending` → `confirmed` → `preparing` → `delivering` → `delivered`

Customers can still cancel `pending` / `confirmed` orders from the customer app.
