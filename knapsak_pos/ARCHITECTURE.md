# Knapsak POS — Architecture (Phase 0)

Finance-first POS/ERP for South Africa (ZAR / VAT). Books are the core; the till posts into them.

## System map

```
Customer Flutter app ──orders/Stripe──► Firestore + Functions
Supplier console ────dispatch/status──► Firestore
Knapsak POS (this app) ──POS events──► Cloud Functions posting engine
                                              │
                                              ▼
                         accounts · journals · periods · inventory · audit
```

Same Firebase project (`knapsak-app-887fc`) initially. Journal writes are **never** client-writable.

## Locked decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Stack | React + TS + Vite (mirror supplier) | Same team patterns; Electron later for tills |
| Money | Integer **cents** (ZAR) | Avoid float drift in ledgers |
| Inventory valuation | **Weighted average** | Grocery-friendly; simpler than FIFO for v1 |
| Posting | Cloud Functions (Admin SDK) | Harder to bypass; balances + audit atomic |
| Auth | Custom claim `posRole` | Separate from delivery `role: supplier` |
| VAT | Configurable rates; default SA standard **15%** | Confirm SARS export formats with accountant |
| Catalog | POS `inventoryItems` is stock SoT; sync subset → public `products` later | Current `products` has no stock fields |

### Roles (`posRole`)

| Role | Can |
|------|-----|
| `owner` | Everything + bootstrap + close periods + grant roles |
| `manager` | POS, inventory adjustments, reports, open/close till |
| `cashier` | Sell, returns (policy), read products |
| `accountant` | Ledgers, journals view, exports, periods (no till) |

## Domain model

### Chart of Accounts — `accounts/{code}`

```ts
{
  code: "4000",
  name: "Retail sales",
  type: "income" | "expense" | "asset" | "liability" | "equity",
  subtype?: string,          // e.g. bank, inventory, vatControl
  normalBalance: "debit" | "credit",
  isPosting: boolean,        // false = header/group only
  isActive: boolean,
  balanceCents: number,      // running balance (signed by normalBalance convention: net debit-credit stored as signed)
  vatRateId?: string | null,
  systemTag?: string | null, // sales, cogs, inventory, vatOutput, cash, cardClearing, …
}
```

### Financial periods — `periods/{periodId}`

```ts
{
  id: "2026-07",
  label: "Jul 2026",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  status: "open" | "closed",
  fiscalYear: 2026,
  closedAt?: Timestamp,
  closedByUid?: string
}
```

### Journals — `journals/{journalId}`

Immutable once `status: "posted"`. Corrections = reversing journal + new entry.

```ts
{
  id: string,
  number: number,            // sequential per org
  date: "2026-07-19",        // accounting date
  periodId: "2026-07",
  source: "manual" | "pos_sale" | "pos_return" | "stock_adjust" | "bootstrap",
  sourceRef?: string,        // e.g. saleId
  memo: string,
  status: "posted",
  lines: [{
    accountCode: string,
    debitCents: number,      // >= 0
    creditCents: number,     // >= 0; exactly one of debit/credit > 0
    memo?: string
  }],
  createdAt: Timestamp,
  createdByUid: string,
  hash?: string              // optional integrity fingerprint later
}
```

**Invariant:** `sum(debitCents) === sum(creditCents)` and both > 0.

### Inventory — `inventoryItems/{itemId}` + `stockMovements/{id}`

Weighted average:

```
newAvg = (qtyOnHand * avgCost + recvQty * recvCost) / (qtyOnHand + recvQty)
sale: COGS = qty * avgCostCents; qtyOnHand -= qty
```

```ts
// inventoryItems
{
  sku, barcode?, name, categoryId?,
  sellPriceCents,          // VAT-inclusive retail (confirm tax-inclusive convention with accountant)
  vatRateId: "za-std-15",
  qtyOnHand: number,       // allow decimals for weight later; Phase 0 int units
  avgCostCents: number,    // ex-VAT unit cost
  stockValueCents: number, // qty * avgCost
  trackStock: boolean,
  isActive: boolean,
  catalogProductId?: string // link to public products/{id} when synced
}
```

### Org settings — `financeSettings/default`

VAT rates, FY start month, valuation method, document sequences snapshot.

### Audit — `financeAudit/{id}`

Who / when / what / before-after for financial events.

## Posting engine (server)

Callable: `postJournal` / domain helpers (`postPosSale` in Phase 1).

Flow:

1. AuthZ by `posRole`
2. Load open period covering `date`
3. Validate accounts exist, are posting + active
4. Validate balanced lines
5. Transaction: allocate journal number → write journal → update account balances → stock movements if needed → audit

Sale template (Phase 1 — VAT-inclusive tender R500 @ 15%):

```
Dr  Card clearing / Cash     50000
Cr  Sales (ex VAT)           43478
Cr  VAT output                6522
Dr  COGS                       …
Cr  Inventory                  …
```

Exact VAT split method (tax-inclusive vs exclusive shelf prices) — **confirm with SA accountant**.

## SA VAT / exports — engineer now, confirm externally

| Topic | Our approach | Needs accountant confirmation |
|-------|--------------|-------------------------------|
| Standard rate | Default 15% configurable | Zero-rated / exempt categories for groceries |
| Input vs output | Separate control accounts | VAT201 field mapping |
| Tax-inclusive pricing | Default for retail sell price | Whether cost is ex-VAT |
| Exports | TB, IS, BS, GL detail, VAT summary CSV/PDF | Official SARS / practitioner formats |
| Document numbers | Sequential invoices/receipts/CNs | Legal invoice field requirements |
| Period close | Soft close months; FY close later | Alignment to tax periods |

Do not market “SARS certified” without external sign-off.

## Firestore security (summary)

- Client **read** finance collections if `posRole` in owner/manager/cashier/accountant (cashier: limited)
- Client **write** journals / account balances / periods close: **denied**
- Mutations only via Admin SDK in Functions

## App routes

- `/login`
- `/` — owner dashboard (till, cash, stock)
- `/pos` — checkout, till open/close, Z-report
- `/inventory` — product master + qty/value
- `/accounts` — Chart of Accounts
- `/journals` — read-only ledger list
- `/exports` — TB / IS / GL / VAT CSV pack
- `/periods` — financial periods

## Phase 1 callables

- `openTill` / `closeTill` / `getOpenTill`
- `postPosSale` — stock + COGS + VAT + journal + till totals (one transaction)
- `exportFinancePack` — date-range export JSON (client downloads CSVs)

## Phase 2 callables

- `ensurePhase2Accounts` — Bank (1120) + GRNI (2150) for older orgs
- `upsertSupplier` / `createPurchaseOrder`
- `postGoodsReceipt` — stock + weighted avg + Dr Inventory/VAT in / Cr GRNI
- `postSupplierBillFromGrn` — Dr GRNI / Cr AP
- `paySupplierBill` — Dr AP / Cr Bank|Cash
- `importBankStatement` / `reconcileBankLine` — match payment, card clearing, or ignore

## Phase 3 callables

- `postPosReturn` — credit note against a sale (partial OK); stock restore at sale unit cost; reverse sales/VAT/COGS; till return totals; Z-report nets cash returns
- `upsertCustomer` / `postCustomerInvoice` / `receiveCustomerPayment` — AR (Dr AR on invoice; Dr Cash|Bank|Card / Cr AR on receipt)
- `postPurchaseReturn` — return against GRN; unbilled reverses GRNI, billed creates supplier credit / reduces AP
- `closePeriod` / `closeFiscalYear` — soft month close; FY posts P&L → retained earnings
- `recordInvoiceReminder` — log overdue reminder + statement text
- `exportFinancePack` — includes reconstructed balance sheet as-of `endDate`
- Timeline events on POS, AR, GRN/bills/payments, and bank matches (`financeTimeline`)

## Deploy

- UI: this repo → Firebase Hosting (add second site `knapsak-pos` when ready)
- Rules + Functions: still deployed from `~/Desktop/knapsak_flutter`
