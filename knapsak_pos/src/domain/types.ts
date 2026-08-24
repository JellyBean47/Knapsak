/** Money is always integer ZAR cents. */
export type Cents = number;

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type NormalBalance = 'debit' | 'credit';
export type PeriodStatus = 'open' | 'closed';
export type JournalStatus = 'posted';
export type JournalSource =
  | 'manual'
  | 'pos_sale'
  | 'pos_return'
  | 'stock_adjust'
  | 'stock_receipt'
  | 'grn'
  | 'supplier_bill'
  | 'supplier_payment'
  | 'customer_invoice'
  | 'customer_payment'
  | 'purchase_return'
  | 'year_end_close'
  | 'bank_recon'
  | 'bootstrap';

export type PosRole = 'owner' | 'manager' | 'cashier' | 'accountant';

export type InventoryValuation = 'weighted_average';

export interface VatRate {
  id: string;
  name: string;
  /** Basis points would be overkill; store percent * 100 (1500 = 15.00%). */
  rateBps: number;
  /** SA categories — confirm mapping with accountant. */
  category: 'standard' | 'zero' | 'exempt';
}

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  subtype?: string;
  normalBalance: NormalBalance;
  isPosting: boolean;
  isActive: boolean;
  /** Net balance in cents: positive = debit-heavy for assets/expenses convention helpers. */
  balanceCents: Cents;
  vatRateId?: string | null;
  /** Stable tags the posting engine uses instead of hard-coded codes. */
  systemTag?: SystemAccountTag | null;
  sortOrder: number;
}

export type SystemAccountTag =
  | 'cash'
  | 'card_clearing'
  | 'bank'
  | 'inventory'
  | 'sales'
  | 'cogs'
  | 'vat_output'
  | 'vat_input'
  | 'accounts_receivable'
  | 'accounts_payable'
  | 'grni'
  | 'owner_equity'
  | 'retained_earnings'
  | 'sales_discounts'
  | 'inventory_adjustments';

export interface FinancialPeriod {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  fiscalYear: number;
  closedAt?: unknown;
  closedByUid?: string;
}

export interface JournalLine {
  accountCode: string;
  debitCents: Cents;
  creditCents: Cents;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  number: number;
  date: string;
  periodId: string;
  source: JournalSource;
  sourceRef?: string;
  memo: string;
  status: JournalStatus;
  lines: JournalLine[];
  createdAt?: unknown;
  createdByUid: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  categoryId?: string;
  /** VAT-inclusive retail price (default retail convention — confirm). */
  sellPriceCents: Cents;
  vatRateId: string;
  qtyOnHand: number;
  /** Ex-VAT weighted average unit cost. */
  avgCostCents: Cents;
  stockValueCents: Cents;
  trackStock: boolean;
  isActive: boolean;
  catalogProductId?: string;
  updatedAt?: unknown;
}

export type StockMovementType =
  | 'receipt'
  | 'sale'
  | 'return'
  | 'adjustment'
  | 'transfer';

export interface StockMovement {
  id: string;
  itemId: string;
  type: StockMovementType;
  qtyDelta: number;
  unitCostCents: Cents;
  stockValueDeltaCents: Cents;
  avgCostAfterCents: Cents;
  qtyAfter: number;
  source: JournalSource | 'manual';
  sourceRef?: string;
  journalId?: string;
  createdAt?: unknown;
  createdByUid: string;
}

export interface FinanceSettings {
  currency: 'ZAR';
  valuationMethod: InventoryValuation;
  fiscalYearStartMonth: number;
  /** Default: sell prices are VAT-inclusive. */
  sellPricesVatInclusive: boolean;
  vatRates: VatRate[];
  defaultVatRateId: string;
  bootstrappedAt?: unknown;
  bootstrappedByUid?: string;
}

export interface PostJournalRequest {
  date: string;
  memo: string;
  source: JournalSource;
  sourceRef?: string;
  lines: JournalLine[];
}

export interface PostJournalResponse {
  journalId: string;
  number: number;
  periodId: string;
}

export type TenderType = 'cash' | 'card';

export interface TillTotals {
  saleCount: number;
  cashCents: Cents;
  cardCents: Cents;
  totalCents: Cents;
  exVatCents: Cents;
  vatCents: Cents;
  cogsCents: Cents;
  returnCount?: number;
  returnCashCents?: Cents;
  returnCardCents?: Cents;
  returnTotalCents?: Cents;
  returnExVatCents?: Cents;
  returnVatCents?: Cents;
  returnCogsCents?: Cents;
}

export interface TillSession {
  id: string;
  status: 'open' | 'closed';
  date: string;
  registerId: string;
  openingFloatCents: Cents;
  openedByUid: string;
  totals: TillTotals;
  countedCashCents?: Cents;
  expectedCashCents?: Cents;
  varianceCents?: Cents;
  zReport?: ZReport;
}

export interface ZReport {
  date: string;
  registerId: string;
  openingFloatCents: Cents;
  expectedCashCents: Cents;
  countedCashCents: Cents;
  varianceCents: Cents;
  saleCount: number;
  cashSalesCents: Cents;
  cardSalesCents: Cents;
  totalSalesCents: Cents;
  returnCount?: number;
  cashReturnsCents?: Cents;
  cardReturnsCents?: Cents;
  totalReturnsCents?: Cents;
  exVatCents: Cents;
  vatCents: Cents;
  cogsCents: Cents;
  grossProfitCents: Cents;
  note?: string | null;
  closedByUid: string;
  closedAt?: string | null;
}

export interface PosSaleLine {
  itemId: string;
  sku: string;
  name: string;
  qty: number;
  qtyReturned?: number;
  unitPriceCents: Cents;
  lineTotalCents: Cents;
  vatRateId: string;
  exVatCents: Cents;
  vatCents: Cents;
  unitCostCents: Cents;
  cogsCents: Cents;
}

export interface PosSale {
  id: string;
  number: number;
  tillSessionId: string;
  date: string;
  tender: TenderType;
  lines: PosSaleLine[];
  totalCents: Cents;
  exVatCents: Cents;
  vatCents: Cents;
  cogsCents: Cents;
  journalId: string;
  journalNumber: number;
  returnStatus?: 'none' | 'partial' | 'fully_returned';
}

export interface PostPosReturnResponse {
  returnId: string;
  returnNumber: number;
  saleId: string;
  saleNumber: number;
  journalId: string;
  journalNumber: number;
  totalCents: Cents;
  exVatCents: Cents;
  vatCents: Cents;
  cogsCents: Cents;
  tender: TenderType;
  date: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  vatNumber?: string | null;
  paymentTermsDays?: number;
  isActive: boolean;
  balanceCents?: Cents;
}

export interface CustomerInvoice {
  id: string;
  number: number;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  status: 'open' | 'partial' | 'paid' | 'void';
  lines: PosSaleLine[];
  totalCents: Cents;
  exVatCents: Cents;
  vatCents: Cents;
  cogsCents: Cents;
  paidCents: Cents;
  balanceCents: Cents;
  journalId: string;
  journalNumber: number;
}

export interface CustomerPayment {
  id: string;
  number: number;
  invoiceId: string;
  invoiceNumber?: number;
  customerId: string;
  customerName: string;
  date: string;
  amountCents: Cents;
  tender: 'cash' | 'bank' | 'card';
  journalId: string;
  journalNumber: number;
}

export interface FinanceTimelineEvent {
  id: string;
  at: string;
  kind: string;
  label: string;
  amountCents?: Cents;
  journalId?: string | null;
  journalNumber?: number | null;
  refId?: string | null;
  refType?: string | null;
}

export interface PosSaleLineInput {
  itemId: string;
  qty: number;
}

export interface PostPosSaleResponse {
  saleId: string;
  saleNumber: number;
  journalId: string;
  journalNumber: number;
  totalCents: Cents;
  exVatCents: Cents;
  vatCents: Cents;
  cogsCents: Cents;
  tender: TenderType;
  date: string;
}

export interface Supplier {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  vatNumber?: string | null;
  paymentTermsDays?: number;
  isActive: boolean;
}

export interface PurchaseOrderLine {
  itemId: string;
  sku: string;
  name: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCostExVatCents: Cents;
  lineExVatCents: Cents;
  vatRateId: string;
}

export interface PurchaseOrder {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  status: 'open' | 'partial' | 'received' | 'cancelled' | 'closed';
  orderDate: string;
  notes?: string | null;
  lines: PurchaseOrderLine[];
  totalExVatCents: Cents;
}

export interface GoodsReceiptLine {
  itemId: string;
  sku: string;
  name: string;
  qty: number;
  qtyReturned?: number;
  unitCostExVatCents: Cents;
  lineExVatCents: Cents;
  vatCents: Cents;
  vatRateId: string;
}

export interface GoodsReceipt {
  id: string;
  number: number;
  purchaseOrderId: string;
  purchaseOrderNumber: number;
  supplierId: string;
  supplierName: string;
  date: string;
  lines?: GoodsReceiptLine[];
  totalInclCents: Cents;
  inventoryExVatCents: Cents;
  vatCents: Cents;
  billed: boolean;
  billId?: string | null;
  journalNumber?: number;
}

export interface SupplierBill {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  goodsReceiptId?: string | null;
  billDate: string;
  status: 'open' | 'partial' | 'paid' | 'void';
  totalCents: Cents;
  paidCents: Cents;
  balanceCents: Cents;
  supplierInvoiceRef?: string | null;
}

export interface SupplierPayment {
  id: string;
  number: number;
  billId: string;
  supplierId: string;
  supplierName: string;
  date: string;
  amountCents: Cents;
  tender: 'bank' | 'cash';
  bankMatched: boolean;
  bankLineId?: string | null;
}

export interface BankLine {
  id: string;
  statementId: string;
  statementNumber: number;
  date: string;
  description: string;
  amountCents: Cents;
  reference?: string | null;
  status: 'unmatched' | 'matched' | 'ignored';
  matchType?: string | null;
  matchRef?: string | null;
  journalId?: string | null;
}

export interface BalanceSheetPack {
  asOfDate: string;
  rows: Array<{
    section: 'asset' | 'liability' | 'equity';
    code: string;
    name: string;
    amountCents: Cents;
  }>;
  totals: {
    assetsCents: Cents;
    liabilitiesCents: Cents;
    equityCents: Cents;
    netEarningsCents: Cents;
    financingCents: Cents;
    differenceCents: Cents;
  };
}

export interface FinanceExportPack {
  meta: {
    startDate: string;
    endDate: string;
    generatedAt: string;
    currency: 'ZAR';
    notes: string[];
  };
  trialBalance: Array<{
    code: string;
    name: string;
    type: string;
    debitCents: Cents;
    creditCents: Cents;
    balanceCents: Cents;
  }>;
  incomeStatement: {
    rows: Array<{
      code: string;
      name: string;
      type: string;
      debitCents: Cents;
      creditCents: Cents;
      netCents: Cents;
    }>;
    incomeTotalCents: Cents;
    expenseTotalCents: Cents;
    netProfitCents: Cents;
  };
  balanceSheet?: BalanceSheetPack;
  generalLedger: Array<{
    date: string;
    journalNumber: number;
    journalId: string;
    source: string;
    memo: string;
    accountCode: string;
    lineMemo: string;
    debitCents: Cents;
    creditCents: Cents;
  }>;
  vatSummary: {
    outputCents: Cents;
    inputCents: Cents;
    netPayableCents: Cents;
  };
  journalCount: number;
}
