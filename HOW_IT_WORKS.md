# How Knapsak works (first draft)

Drafted from the app READMEs, POS `ARCHITECTURE.md` / `HANDOVER.md`, and supplier `HANDOVER.md`. Features listed here are those already documented — not a product wishlist.

Knapsak is a South Africa retail / grocery-delivery platform in **ZAR**, with **SA VAT** as a first-class design constraint. Three apps share one Firebase project: **`knapsak-app-887fc`**.

```
Customer app (Flutter)
        ↓ orders / Stripe payments
Firestore + Cloud Functions + Stripe
        ↓
Supplier console (dispatch / status)
        ↓
POS + Finance ERP  ←  till, inventory, double-entry books, tax-ready exports
        ↓ (later, not built)
Employee picker app · unified catalog across channels
```

Brand (from the handovers): primary teal `0xFF00796B`, accent red `0xFFD32F2F`. Currency: ZAR.

---

## 1. Flutter customer app (`knapsak_flutter`)

Customer-facing shop. Handovers describe the MVP as complete.

What it does today:

- Auth, shop (Firestore catalog, with a demo fallback), cart, **Stripe** checkout
- Orders plus a status timeline, including cancel with `cancelledFromStatus`
- Saved addresses; GPS / geocoding on web
- Category / delivery filter tabs
- `FirestoreService` as the single data layer
- User profile on signup plus `ensureUserProfile()`
- Auth-guarded order routes
- `ProductImage` + `cached_network_image`
- Widget tests with a Firebase mock

Cloud Functions that live in this repo (Node 22 in the supplier handover): `createPaymentIntent`, `setSupplierRole`. The same repo also hosts POS finance Functions and the shared `firestore.rules` / indexes.

Backend deploy (from this repo):

```bash
firebase deploy --only firestore:rules,functions --project knapsak-app-887fc
```

Run (from the Flutter handover):

```bash
flutter pub get && flutter run -d chrome
```

The Flutter README in-tree is still the default `flutter create` stub; the behaviour above comes from the POS and supplier handovers.

---

## 2. Supplier console (`knapsak_supplier`)

PC web console for store operators: live orders from Firebase and status updates for dispatch. Vite + React + TypeScript + Firebase Auth/Firestore.

Live URL (default Firebase Hosting site): https://knapsak-app-887fc.web.app

What it does today:

- Supplier-only login (`role: 'supplier'` custom claim)
- Live order list, status filters, search (order ID, address, or product name), date range (+ Today)
- Order detail and status advance: `pending → confirmed → preparing → delivering → delivered`
- New-order chime, tab badge, desktop notifications, yellow **Open** banner; mute is saved in the browser
- Printable pick list / packing slip
- Shortcuts on order detail: `A` / `Enter` advance · `P` print · `Esc` back
- Supplier issue notes (`supplierNote`) and cancel (`cancelledBy: 'supplier'`) before delivered

Customers can still cancel `pending` / `confirmed` orders from the customer app.

Grant access: create an Auth user, then from the Flutter repo `scripts/` run `node set-supplier-role.js you@example.com`, then sign out/in so the ID token refreshes. Extra suppliers can also be granted via the `setSupplierRole` callable while signed in as an existing supplier.

---

## 3. POS / finance ERP (`knapsak_pos`)

Finance-first POS + inventory + accounting (ZAR, SA VAT). Books are the core; the till posts into them. Stack: React + TypeScript + Vite, same Firebase project.

POS UI is **not** production-hosted yet. Deploying to the default Firebase Hosting site would overwrite the supplier console — add a second site (e.g. `knapsak-pos`) first.

Handover status: **Phases 0–3 done** in the POS track. Phase 1/2 flows in the POS README still describe the original sell and buy paths.

### Phase 1 flow (sell)

1. Add inventory items (Inventory)
2. Open till (POS) with opening float
3. Sell with cash/card — each pay posts journals + stock + COGS + VAT
4. Close till → Z-report
5. Exports → date-range CSV pack (TB / IS / GL / VAT)

### Phase 2 flow (buy + bank)

1. Dashboard → **Ensure Phase 2 accounts** (Bank 1120 + GRNI 2150)
2. Suppliers → add creditor
3. Purchasing → PO → Post GRN (stock + VAT input + GRNI) → Create bill (AP)
4. Bills → pay from bank/cash
5. Banking → paste CSV → match payment or clear card clearing

### Phase 3 (credit + polish, from POS handover)

POS returns / credit notes, customers + AR invoices + receipts, customer statements + overdue reminder log, finance timeline, purchasing returns / supplier credit notes, dated balance sheet in the export pack, period close + fiscal year-end close to retained earnings.

### Locked POS design (do not treat as optional)

| Decision | Choice |
|----------|--------|
| Money | Integer ZAR **cents** (avoid float drift) |
| Inventory valuation | **Weighted average** (not FIFO) |
| Posting | Cloud Functions / Admin SDK only — journals are never client-writable |
| VAT | Configurable rates; default SA standard **15%**; retail sell prices VAT-inclusive by default |
| Catalog source of truth | POS `inventoryItems`; public `products` has no stock fields yet |
| Auth | Custom claim `posRole`, separate from delivery `role: supplier` |

Exact VAT split (tax-inclusive vs exclusive shelf prices, zero-rated grocery categories, VAT201 field mapping, legal invoice fields) is documented as **confirm with a SA accountant**. Do not market “SARS certified” without that sign-off.

Grant POS access from the Flutter repo `scripts/`: `node set-pos-role.js you@example.com owner`, then sign out/in. In the POS UI as owner: **Bootstrap finance** (once).

---

## 4. Shared Firebase, roles, and security

**Project:** `knapsak-app-887fc`

### Auth roles

| Who | Claim | What they can do (as documented) |
|-----|--------|----------------------------------|
| Customer | none (normal Auth user) | Browse, cart, Stripe pay, track / cancel own orders (pending/confirmed) |
| Supplier | `role: 'supplier'` | Read all orders; advance status; pick list; notes; cancel |
| POS owner | `posRole: owner` | Everything POS + bootstrap + close periods + grant roles |
| POS manager | `posRole: manager` | POS, inventory adjustments, reports, open/close till |
| POS cashier | `posRole: cashier` | Sell, returns (policy), read products |
| POS accountant | `posRole: accountant` | Ledgers, journals view, exports, periods (no till) |

### Firestore rules (summary from supplier handover)

- Catalog: public read
- Orders: owner read/cancel; supplier read all + advance status / cancel / note
- Users / addresses: owner only
- Finance collections: client **read** by `posRole`; client **write** of journals / account balances / period close is **denied**. Mutations go through Admin SDK in Functions.

---

## 5. Order flow (customer ↔ supplier)

Online orders live in `orders/{orderId}`. Relevant fields from the supplier handover:

- `userId`, `items[]` (`productId`, `productName`, `productPrice`, `quantity`, `totalPrice`)
- `totalAmount`, `status`, `paymentIntentId`, `paymentStatus`
- `deliveryAddress`, `createdAt`, `statusUpdatedAt`
- Cancel fields: `cancelledAt`, `cancelledFromStatus`, `cancelledBy`
- `supplierNote`

Happy path:

1. Customer browses catalog, adds to cart, pays with Stripe (`createPaymentIntent` → order with `paymentStatus` paid).
2. Order appears live in the supplier console.
3. Supplier advances `pending → confirmed → preparing → delivering → delivered` (or cancels with a note before delivered).
4. Customer can cancel while status is `pending` or `confirmed`.

**Not wired yet (documented gap):** Flutter online orders do not post into the POS ledger / inventory. Stripe settlements do not yet clear card-clearing / bank in the POS books. Public `products` and POS `inventoryItems` are not one catalog. Plan is one inventory source of truth — it is not built.

---

## 6. POS posting (till events → books)

Journal writes are server-authoritative. Typical sale (VAT-inclusive tender, 15% example from architecture):

```
Dr  Card clearing / Cash     tender
Cr  Sales (ex VAT)           ...
Cr  VAT output               ...
Dr  COGS                     qty × weighted-average cost
Cr  Inventory                same
```

Invariant: each posted journal balances (`sum(debitCents) === sum(creditCents)`). Posted journals are immutable; corrections are reversing journals + a new entry.

Key finance collections: `accounts`, `periods`, `journals`, `inventoryItems` / `stockMovements`, `tillSessions` / `posSales`, suppliers / POs / GRNs, AP bills / payments, bank statements / lines, POS returns, AR customers / invoices / payments, purchase returns / supplier credit notes, `financeTimeline`, `financeSettings` / `financeAudit` / `documentSequences`.

Rules + Functions still deploy from `knapsak_flutter`. POS UI deploys from `knapsak_pos` only after a second Hosting site exists.

---

## 7. Explicitly later (out of scope in the current docs)

- Employee in-store picker app
- Full Odoo-style HR / manufacturing / projects
- Multi-company consolidation
- Hardware deep-dive (scales, fiscal printers) beyond basic receipts
- Electron / offline till packaging
- FIFO valuation option
- Automated email / WhatsApp reminder delivery (POS reminders today: log + clipboard text)

This draft should be updated when testers find behaviour that does not match the docs, or when channel integration ships.
