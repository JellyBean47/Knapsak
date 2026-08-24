# Knapsak — Chat Handoff (Jul 19, 2026)

> **POS / finance status (Phases 0–2 done, Phase 3 next):**  
> see **[`~/Desktop/knapsak_pos/HANDOVER.md`](file:///Users/ebenoelofse/Desktop/knapsak_pos/HANDOVER.md)** — that doc is the up-to-date handoff for the ERP.

Use this to continue in a new chat (supplier + platform overview).

| App | Path | Role |
|-----|------|------|
| **Customer** | `~/Desktop/knapsak_flutter` | Browse, cart, Stripe pay, track orders (Flutter) |
| **Supplier console** | `~/Desktop/knapsak_supplier` | Live orders, status, pick list, cancel/notes (React web) |
| **POS / Finance ERP** | `~/Desktop/knapsak_pos` — Phase 0–2 | Finance-first POS + inventory + accounting |

**Firebase project:** `knapsak-app-887fc`  
**Supplier live URL:** https://knapsak-app-887fc.web.app  
**Brand:** Primary teal `0xFF00796B` / Accent red `0xFFD32F2F` · Currency ZAR

---

## Platform vision (end state)

```
Customer app (Flutter)
        ↓ orders / payments
Firestore + Cloud Functions + Stripe
        ↓
Supplier console (dispatch / status)
        ↓
POS + Finance ERP (next)  ←  finance-first bookkeeping, inventory, tax-ready exports
        ↓ (later)
Employee picker app
```

---

## What is done

### Customer app (`knapsak_flutter`) — MVP complete

- Auth, shop (Firestore + demo fallback), cart, Stripe checkout  
- Orders + timeline (incl. cancel with `cancelledFromStatus`)  
- Saved addresses + GPS/geocoding on web  
- Category / delivery filter tabs  
- `FirestoreService` as single data layer  
- User profile on signup + `ensureUserProfile()`  
- Auth-guarded order routes  
- `ProductImage` + `cached_network_image`  
- Widget tests with Firebase mock  
- Cloud Functions: `createPaymentIntent`, `setSupplierRole` (Node 22)  
- Firestore rules (customer + supplier roles)

### Supplier console (`knapsak_supplier`) — ops MVP + polish

- Vite + React + TypeScript + Firebase Auth/Firestore  
- Supplier-only login (`role: 'supplier'` custom claim)  
- Live order list, status filters, search, date range  
- Order detail + status advance:  
  `pending → confirmed → preparing → delivering → delivered`  
- New-order chime, tab badge, desktop notifications, yellow **Open** banner  
- Printable pick list / packing slip  
- Shortcuts: `A`/`Enter` advance · `P` print · `Esc` back  
- Supplier issue notes (`supplierNote`) + cancel (`cancelledBy: 'supplier'`)  
- Firebase Hosting deployed  

**Bootstrap supplier user:**

```bash
cd ~/Desktop/knapsak_flutter/scripts
node set-supplier-role.js supplier@example.com
# then sign out/in so the ID token refreshes
```

**Redeploy supplier UI:**

```bash
cd ~/Desktop/knapsak_supplier
npm run deploy
```

**Redeploy rules / functions:**

```bash
cd ~/Desktop/knapsak_flutter
firebase deploy --only firestore:rules,functions --project knapsak-app-887fc
```

---

## Firestore (current)

### `orders/{orderId}` (relevant fields)

```json
{
  "userId": "...",
  "items": [{ "productId", "productName", "productPrice", "quantity", "totalPrice" }],
  "totalAmount": 62.96,
  "status": "confirmed",
  "paymentIntentId": "pi_...",
  "paymentStatus": "paid",
  "deliveryAddress": "...",
  "createdAt": "<timestamp>",
  "statusUpdatedAt": "<timestamp>",
  "cancelledAt": "<timestamp>",
  "cancelledFromStatus": "confirmed",
  "cancelledBy": "supplier",
  "supplierNote": "Out of stock — refunded"
}
```

### Auth roles

- Customers: normal Auth users (no special claim)  
- Suppliers: custom claim `role: 'supplier'`  

### Rules (summary)

- Catalog: public read  
- Orders: owner read/cancel; supplier read all + advance status / cancel / note  
- Users/addresses: owner only  

---

## Next objective — Finance-First POS / ERP

### Why this exists

Most POS tools are **sales-first**; accounting is bolted on.  
Pastel-class tools are **finance-first** but feel outdated.

**Knapsak POS goal:** Pastel-grade bookkeeping + tax confidence, with a modern Square/Xero-like UI.

| Traditional POS | Knapsak POS (target) |
|-----------------|----------------------|
| Sales first | **Finance first** |
| Accounting later | Accounting is the core |
| Pretty dashboards | Dashboards **and** double-entry |
| Basic reports | Accountant-grade + tax-ready exports |

**Non-negotiable:** when tax season comes, the client can export a year’s books with confidence (VAT, income statement, trial balance, ledger detail) that an accountant can use.

### Product inspirations

| Source | Take |
|--------|------|
| **Pastel** | GL, debtors/creditors, VAT, TB, IS, BS, journals, year-end close |
| **Square** | Fast checkout, inventory, customers, clean UI |
| **Lightspeed** | POs, suppliers, stock ops |
| **Xero** | Banking, recon, modern finance UX |
| **Odoo** | Modular growth path (CRM, etc. later) |

### Architecture layers (build order)

#### Layer 1 — POS
Sales, returns, discounts, receipts, barcode, till/shifts, multi-tender (cash/card/EFT)

#### Layer 2 — Inventory
Products, categories, variants, adjustments, transfers, warehouses, **stock valuation** (ties to COGS)

#### Layer 3 — Accounting (heart)
Every business event posts **double-entry journals** automatically.

Example — sell R500 item on card:

```
Dr  Bank / Card clearing     500
Cr  Sales                    500   (excl. VAT split as required)

Dr  Cost of sales            …
Cr  Inventory                …
```

Plus VAT control accounts as configured (SA VAT).  
Users don’t think in debits/credits unless they open the ledger.

#### Layer 4 — Banking
Statement import, match/recon, EFT, balances

#### Layer 5 — Customers
Credit accounts, loyalty, quotes, invoices, statements, reminders  
*(connects to existing Knapsak delivery customers over time)*

#### Layer 6 — Suppliers
POs, GRN, supplier invoices, payments, statements  
*(connects to supplier console / purchasing later)*

#### Layer 7 — Reporting
Modern cards + drill-down charts; underneath: TB, IS, BS, VAT returns, aged debtors/creditors, inventory valuation

#### Layer 8 — Owner dashboard
Today’s sales · till cash · bank · month profit · AR · AP · stock value — no menu archaeology

### Differentiator — everything connected

On **Pay**:

- Inventory ↓  
- Customer history / loyalty  
- Journals + VAT + COGS  
- Profit / dashboard / statements update  

### Differentiator — Finance Timeline

On any invoice/sale/payment, a chronological audit trail:

```
Customer created → Quote → Invoice → Stock reserved
→ Payment → Bank reconciled → Journal posted → VAT recorded
```

### Compliance / tax readiness (design constraints)

Treat these as **first-class requirements**, not v2 extras:

1. **Double-entry ledger** — every posting balances; immutable posted journals (corrections via reversing entries)  
2. **Audit trail** — who/when/what for financial events  
3. **Financial periods** — open/close months; year-end close  
4. **VAT** — configurable rates; input/output; export suitable for SARS-oriented workflows (confirm exact formats with an accountant)  
5. **Exports** — CSV/PDF (and later accountant packages): Trial Balance, Income Statement, Balance Sheet, General Ledger detail, VAT summary, sales/purchases journals for a date range / FY  
6. **Document numbering** — sequential invoices/receipts/credit notes  
7. **Multi-user roles** — cashier vs manager vs accountant (permissions)  
8. **South Africa first** — ZAR, SA VAT concepts; don’t hard-code US sales-tax models  

> Note: “tax compliant” claims should be validated with a SA accountant/bookkeeper before marketing. Engineer for exportability and auditability; legal sign-off is external.

### Suggested stack (POS — draft, decide in build chat)

Align with supplier console unless there’s a reason not to:

- **Web (React + TypeScript + Vite)** — primary; Electron later for till hardware  
- **Firebase** same project initially *or* dedicated finance DB if ledger volume/rules demand it  
- Prefer a clear **domain model** (Chart of Accounts, JournalEntry, LedgerLine, Period) even if storage is Firestore  
- Consider **Cloud Functions** for posting engine (harder to bypass than client-only writes)  
- Hosting: Firebase Hosting (second site or path) / later till PWA  

**Strong recommendation:** journal posting should be server-authoritative (Functions/Admin), not free-form client writes to ledger collections.

### Suggested Phase 0 → 1 for POS

```
Phase 0 — Foundations
  ├── Chart of Accounts (SA retail defaults)
  ├── Financial periods
  ├── Journal posting engine + audit log
  ├── Product master + inventory qty/value (FIFO or weighted avg — decide)
  └── Roles: owner / cashier / accountant

Phase 1 — Sell + books
  ├── POS checkout (cash/card)
  ├── Auto journals + stock + COGS + VAT
  ├── Till open/close / Z-report
  ├── Basic dashboard
  └── FY date-range export pack (TB, IS, GL, VAT)

Phase 2 — Buy + bank
  ├── Suppliers + POs + GRN
  ├── Supplier bills + payments
  └── Bank import + reconciliation

Phase 3 — Credit + polish
  ├── Customer invoices / statements
  ├── Finance Timeline UI
  ├── Returns / credit notes
  └── Deeper reports + accountant export formats
```

### Relationship to existing Knapsak apps

| Existing | POS relationship |
|----------|------------------|
| Customer Flutter app | Online channel; orders should eventually post into same ledger / inventory |
| Supplier console | Ops/dispatch; purchasing + stock receipts should share inventory + AP |
| Stripe | Online payments → clear to bank/clearing accounts in ledger |
| `products` in Firestore | Likely becomes subset of POS product master (or synced) |

Do **not** fork three disconnected product catalogs long-term — plan one inventory source of truth.

---

## Out of scope for POS v1 (explicitly later)

- Full Odoo-style HR / manufacturing / projects  
- Multi-company consolidation  
- Hardware certification deep-dive (scales, fiscal printers) beyond basic receipt printing  
- Employee in-store picker app (separate track)

---

## Copy-paste prompt for next chat (POS)

```
I'm building Knapsak — grocery delivery + retail ops in South Africa (ZAR / VAT).

Done:
- Customer Flutter app: ~/Desktop/knapsak_flutter (Firebase knapsak-app-887fc, Stripe)
- Supplier console: ~/Desktop/knapsak_supplier (https://knapsak-app-887fc.web.app)
  — live orders, status, pick list, notes, cancel, hosting

Next objective: FINANCE-FIRST POS / ERP (not a sales-only till).
Inspiration: Pastel (books) + Square/Lightspeed (POS/inventory) + Xero (modern finance UI).

Core requirement: double-entry bookkeeping, audit trail, VAT, financial periods,
and tax-season exports (TB, IS, BS, GL, VAT) an accountant can trust.
Every sale/purchase/payment should auto-post journals + update stock/COGS/dashboard.
Users shouldn't need to know debits/credits day-to-day.

Read ~/Desktop/knapsak_supplier/HANDOVER.md for full context.

Please start with:
1) Architecture for the posting engine + data model (CoA, journals, periods, inventory valuation)
2) SA VAT / export considerations (flag what needs accountant confirmation)
3) Scaffold the POS web app (React+TS) and Phase 0 foundations
Prefer server-authoritative journal posting (Cloud Functions) over client-writable ledgers.
```

---

## How to run (quick)

```bash
# Customer
cd ~/Desktop/knapsak_flutter && flutter pub get && flutter run -d chrome

# Supplier
cd ~/Desktop/knapsak_supplier && npm install && npm run dev
```

---

## Summary

| Area | Status |
|------|--------|
| Customer MVP | Done |
| Supplier ops console | Done + hosted |
| Finance-first POS | **Phase 0–2** → `~/Desktop/knapsak_pos` (till, purchasing, bank recon) |
| Employee picker | Later |
| Unified inventory/ledger across channels | Design in POS Phase 0 |

**Bottom line:** delivery + dispatch are working. The strategic gap is a **finance-core POS** that sells like Square but books like Pastel — modern UI, automatic double-entry, and year-end export confidence.
