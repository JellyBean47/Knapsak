# Knapsak — Chat Handoff (Jul 19, 2026)

Use this to continue in a new chat. Deep architecture: [ARCHITECTURE.md](./ARCHITECTURE.md). Run notes: [README.md](./README.md).

| App | Path | Role | Status |
|-----|------|------|--------|
| **Customer** | `~/Desktop/knapsak_flutter` | Browse, cart, Stripe pay, track orders (Flutter) | MVP done |
| **Supplier console** | `~/Desktop/knapsak_supplier` | Live orders, status, pick list, cancel/notes | Ops MVP + hosted |
| **POS / Finance ERP** | `~/Desktop/knapsak_pos` | Finance-first POS + inventory + accounting | **Phases 0–3 done** |

**Firebase project:** `knapsak-app-887fc`  
**Supplier live URL:** https://knapsak-app-887fc.web.app  
**POS hosting:** not production-deployed yet (see warnings below)  
**Brand:** Primary teal `0xFF00796B` / Accent red `0xFFD32F2F` · Currency ZAR

---

## Platform vision

```
Customer app (Flutter)
        ↓ orders / payments
Firestore + Cloud Functions + Stripe
        ↓
Supplier console (dispatch / status)
        ↓
POS + Finance ERP  ←  finance-first bookkeeping, inventory, tax-ready exports
        ↓ (later)
Employee picker app · unified catalog across channels
```

---

## What is done

### Customer app (`knapsak_flutter`) — MVP complete

- Auth, shop (Firestore + demo fallback), cart, Stripe checkout  
- Orders + timeline (incl. cancel with `cancelledFromStatus`)  
- Saved addresses + GPS/geocoding on web  
- Cloud Functions: `createPaymentIntent`, `setSupplierRole`  
- Firestore rules (customer + supplier roles)  
- **Also hosts** POS finance Functions + shared `firestore.rules` / indexes  

### Supplier console (`knapsak_supplier`) — ops MVP + polish

- Vite + React + TypeScript + Firebase Auth/Firestore  
- Supplier-only login (`role: 'supplier'`)  
- Live orders, status advance, pick list, notes, cancel  
- Hosted on default Firebase Hosting site  

### POS / Finance ERP (`knapsak_pos`) — Phases 0–3

Stack: React + TypeScript + Vite + Firebase (same project).  
Auth: custom claim `posRole` ∈ `owner` | `manager` | `cashier` | `accountant`.  
Ledger writes: **server-authoritative** (Cloud Functions only).

#### Phase 0 — Foundations ✅

- Chart of Accounts (SA retail defaults)  
- Financial periods  
- Journal posting engine + `financeAudit`  
- Inventory master (`inventoryItems`) with **weighted average** valuation  
- Roles + bootstrap (`bootstrapFinance`)  
- App shell: Dashboard, Accounts, Periods, Inventory, Journals  

#### Phase 1 — Sell + books ✅

- POS checkout (cash/card)  
- `postPosSale` — stock ↓, COGS, VAT split, double-entry, till totals (one transaction)  
- Till open/close + Z-report  
- Owner dashboard metrics (till, cash, stock value)  
- Export pack: Trial Balance, Income Statement, GL, VAT summary (CSV)  

#### Phase 2 — Buy + bank ✅

- Suppliers master  
- Purchase orders → GRN (stock + VAT input + GRNI) → supplier bill (AP)  
- Bill payments (bank / cash)  
- Bank statement CSV import + reconcile (match payment / clear card clearing / ignore)  
- Phase 2 CoA: Bank `1120`, GRNI `2150` (+ `ensurePhase2Accounts` for older orgs)  

#### Phase 3 — Credit + polish ✅

- POS returns / credit notes (`postPosReturn`) — partial returns, reversing journals, stock restore, till/Z-report  
- Customers + AR invoices + receipts (`upsertCustomer`, `postCustomerInvoice`, `receiveCustomerPayment`)  
- Customer statements + overdue **reminders** (`recordInvoiceReminder`)  
- Finance Timeline on sales/returns/invoices/payments/**bills/GRNs/bank**  
- Purchasing returns / supplier credit notes (`postPurchaseReturn`)  
- Dated **balance sheet** in export pack (as-of end date)  
- Period close + fiscal year-end close to retained earnings (`closePeriod`, `closeFiscalYear`)

### Key collections (finance)

| Collection | Purpose |
|------------|---------|
| `accounts` | Chart of Accounts + running balances |
| `periods` | Open/closed financial months |
| `journals` | Immutable posted journals |
| `inventoryItems` / `stockMovements` | Stock + valuation trail |
| `tillSessions` / `posSales` | Till + retail sales |
| `suppliers` / `purchaseOrders` / `goodsReceipts` | Buy side |
| `supplierBills` / `supplierPayments` | AP |
| `bankStatements` / `bankLines` | Bank import + recon |
| `posReturns` | POS credit notes / refunds |
| `customers` / `customerInvoices` / `customerPayments` | AR |
| `purchaseReturns` / `supplierCreditNotes` | Buy-side returns / AP credits |
| `financeTimeline` | Cross-doc finance event trail |
| `financeSettings` / `financeAudit` / `documentSequences` | Config, audit, numbering |

### Key Cloud Functions (deploy from Flutter repo)

| Callable | Phase |
|----------|-------|
| `bootstrapFinance`, `postJournal`, `upsertInventoryItem`, `setPosRole` | 0 |
| `openTill`, `closeTill`, `getOpenTill`, `postPosSale`, `exportFinancePack` | 1 |
| `ensurePhase2Accounts`, `upsertSupplier`, `createPurchaseOrder`, `postGoodsReceipt`, `postSupplierBillFromGrn`, `paySupplierBill`, `importBankStatement`, `reconcileBankLine` | 2 |
| `postPosReturn`, `upsertCustomer`, `postCustomerInvoice`, `receiveCustomerPayment` | 3 |
| `postPurchaseReturn`, `closePeriod`, `closeFiscalYear`, `recordInvoiceReminder` | 3 polish |
| `exportFinancePack` (now includes dated balance sheet) | 1+3 |

Plus existing: `createPaymentIntent`, `setSupplierRole`.

### Locked design decisions

| Decision | Choice |
|----------|--------|
| Money | Integer ZAR **cents** |
| Inventory | **Weighted average** (not FIFO) |
| Posting | Cloud Functions / Admin SDK only |
| VAT | Configurable; default SA standard **15%**; sell prices VAT-inclusive by default |
| Catalog SoT | POS `inventoryItems` (public `products` has no stock yet) |

---

## How to run / deploy

### Grant POS access

```bash
cd ~/Desktop/knapsak_flutter/scripts
node set-pos-role.js ebenjohn82@gmail.com owner
# sign out / in so the ID token refreshes
```

### Deploy backend (rules + functions + indexes)

```bash
cd ~/Desktop/knapsak_flutter
firebase deploy --only firestore:rules,firestore:indexes,functions --project knapsak-app-887fc
```

### Run POS locally

```bash
cd ~/Desktop/knapsak_pos
npm install
npm run dev
```

Then: sign in → **Bootstrap finance** (once) → **Ensure Phase 2 accounts** if you bootstrapped before Phase 2.

### Deploy POS UI — caution

```bash
cd ~/Desktop/knapsak_pos
npm run deploy
```

> **Do not deploy POS hosting to the default site yet** — it would overwrite the supplier console at `knapsak-app-887fc.web.app`. Add a **second Firebase Hosting site** (e.g. `knapsak-pos`) first.

### Supplier / customer (quick)

```bash
# Customer
cd ~/Desktop/knapsak_flutter && flutter pub get && flutter run -d chrome

# Supplier
cd ~/Desktop/knapsak_supplier && npm install && npm run dev
```

---

## What still needs to be done

### Ops / plumbing (do soon)

- [x] Deploy latest polish functions (`postPurchaseReturn`, `closePeriod`, `closeFiscalYear`, `recordInvoiceReminder`, BS export) — Jul 19  
- [ ] End-to-end smoke test: sale → return → invoice/pay/reminder → PO/GRN/return/bill/pay → bank match → export (incl. BS) → period close  
- [ ] Configure **second Firebase Hosting site** for POS before any production UI deploy  
- [ ] Confirm with SA accountant: VAT categories, tax-inclusive pricing, VAT201/export formats, invoice field requirements  
- [ ] Do **not** market “SARS certified” without external sign-off  

### Phase 3 polish notes

Done in-app. Still external / nice-to-have:

- [ ] Confirm VAT201 / accountant package field mapping with SA accountant  
- [ ] Automated email/WhatsApp reminder delivery (today: log + clipboard text)  
- [ ] TB as-of-date reconstruction (BS is dated; TB remains current snapshot)

### Cross-app integration (strategic gap)

- [ ] **One inventory source of truth** — sync `inventoryItems` ↔ public `products` (customer app catalog)  
- [ ] Online Flutter orders → post into same ledger / inventory on payment/fulfillment  
- [ ] Stripe settlements → clear card clearing / bank in ledger  
- [ ] Supplier console purchasing/receipts share POS inventory + AP (or deep-link)  

### Explicitly later (out of scope for current POS track)

- Employee in-store picker app  
- Full Odoo-style HR / manufacturing / projects  
- Multi-company consolidation  
- Hardware deep-dive (scales, fiscal printers) beyond basic receipts  
- Electron / offline till packaging  
- FIFO valuation option  

---

## Suggested next-chat prompt

```
I'm continuing Knapsak POS / finance ERP (ZAR / SA VAT).

Done (Phases 0–3) in ~/Desktop/knapsak_pos + Flutter functions:
- Ledger, POS sell/returns, buy/bank, AR, timelines
- Purchase returns, dated BS export, period/FY close, invoice reminders

Backend: ~/Desktop/knapsak_flutter. Read HANDOVER.md + ARCHITECTURE.md.

Next priorities:
1) Confirm Firebase deploy of latest polish functions + smoke-test
2) Second Firebase Hosting site for POS UI
3) Cross-app inventory/ledger sync (Flutter orders ↔ POS)
Prefer extending existing posting engine; no client-writable ledgers.
```

---

## Summary

| Area | Status |
|------|--------|
| Customer MVP | Done |
| Supplier ops console | Done + hosted |
| POS Phase 0 foundations | Done |
| POS Phase 1 sell + books | Done |
| POS Phase 2 buy + bank | Done |
| POS Phase 3 credit + polish | **Done** |
| Unified inventory/ledger across channels | **Not started** |
| POS production hosting (own site) | **Not configured** |
| Employee picker | Later |

**Bottom line:** Delivery + dispatch work; the POS now sells, buys, returns, invoices on credit, closes periods, and exports a dated balance sheet. Remaining gap is channel integration and safe production hosting for the POS UI.
