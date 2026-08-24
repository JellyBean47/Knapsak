import { httpsCallable } from 'firebase/functions';
import type {
  FinanceExportPack,
  InventoryItem,
  JournalEntry,
  PosSaleLineInput,
  PostJournalRequest,
  PostJournalResponse,
  PostPosSaleResponse,
  PostPosReturnResponse,
  PosRole,
  TenderType,
  TillSession,
  ZReport,
} from '../domain/types';
import { functions } from '../firebase';

export async function bootstrapFinance(input?: {
  fiscalYear?: number;
  periodMonth?: number;
}): Promise<{ accounts: number; periodId: string }> {
  const fn = httpsCallable(functions, 'bootstrapFinance');
  const res = await fn(input ?? {});
  return res.data as { accounts: number; periodId: string };
}

export async function postJournal(
  request: PostJournalRequest,
): Promise<PostJournalResponse> {
  const fn = httpsCallable(functions, 'postJournal');
  const res = await fn(request);
  return res.data as PostJournalResponse;
}

export async function upsertInventoryItem(
  item: Omit<InventoryItem, 'stockValueCents' | 'updatedAt'> & {
    stockValueCents?: number;
  },
): Promise<{ id: string }> {
  const fn = httpsCallable(functions, 'upsertInventoryItem');
  const res = await fn(item);
  return res.data as { id: string };
}

export async function setPosRole(input: {
  email: string;
  posRole: PosRole | null;
}): Promise<{ uid: string; email: string; posRole: PosRole | null }> {
  const fn = httpsCallable(functions, 'setPosRole');
  const res = await fn(input);
  return res.data as { uid: string; email: string; posRole: PosRole | null };
}

export async function openTill(input: {
  openingFloatCents: number;
  registerId?: string;
}): Promise<{ tillSessionId: string } & Partial<TillSession>> {
  const fn = httpsCallable(functions, 'openTill');
  const res = await fn(input);
  return res.data as { tillSessionId: string } & Partial<TillSession>;
}

export async function closeTill(input: {
  tillSessionId: string;
  countedCashCents: number;
  note?: string;
}): Promise<{ tillSessionId: string; zReport: ZReport }> {
  const fn = httpsCallable(functions, 'closeTill');
  const res = await fn(input);
  return res.data as { tillSessionId: string; zReport: ZReport };
}

export async function getOpenTill(): Promise<{ session: TillSession | null }> {
  const fn = httpsCallable(functions, 'getOpenTill');
  const res = await fn({});
  return res.data as { session: TillSession | null };
}

export async function postPosSale(input: {
  tillSessionId: string;
  tender: TenderType;
  lines: PosSaleLineInput[];
  date?: string;
}): Promise<PostPosSaleResponse> {
  const fn = httpsCallable(functions, 'postPosSale');
  const res = await fn(input);
  return res.data as PostPosSaleResponse;
}

export async function postPosReturn(input: {
  tillSessionId: string;
  saleId: string;
  lines: PosSaleLineInput[];
  date?: string;
  note?: string;
}): Promise<PostPosReturnResponse> {
  const fn = httpsCallable(functions, 'postPosReturn');
  const res = await fn(input);
  return res.data as PostPosReturnResponse;
}

export async function upsertCustomer(customer: {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  vatNumber?: string;
  paymentTermsDays?: number;
  isActive?: boolean;
}): Promise<{ id: string }> {
  const fn = httpsCallable(functions, 'upsertCustomer');
  const res = await fn(customer);
  return res.data as { id: string };
}

export async function postCustomerInvoice(input: {
  customerId: string;
  lines: PosSaleLineInput[];
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
}): Promise<{
  invoiceId: string;
  number: number;
  totalCents: number;
  journalId: string;
}> {
  const fn = httpsCallable(functions, 'postCustomerInvoice');
  const res = await fn(input);
  return res.data as {
    invoiceId: string;
    number: number;
    totalCents: number;
    journalId: string;
  };
}

export async function receiveCustomerPayment(input: {
  invoiceId: string;
  amountCents: number;
  tender: 'cash' | 'bank' | 'card';
  date?: string;
}): Promise<{
  paymentId: string;
  number: number;
  amountCents: number;
  invoiceBalanceCents: number;
}> {
  const fn = httpsCallable(functions, 'receiveCustomerPayment');
  const res = await fn(input);
  return res.data as {
    paymentId: string;
    number: number;
    amountCents: number;
    invoiceBalanceCents: number;
  };
}

export async function postPurchaseReturn(input: {
  goodsReceiptId: string;
  lines: Array<{ itemId: string; qty: number }>;
  date?: string;
  note?: string;
}): Promise<{
  purchaseReturnId: string;
  number: number;
  journalId: string;
  totalInclCents: number;
  creditNoteId: string | null;
  creditNoteNumber: number | null;
}> {
  const fn = httpsCallable(functions, 'postPurchaseReturn');
  const res = await fn(input);
  return res.data as {
    purchaseReturnId: string;
    number: number;
    journalId: string;
    totalInclCents: number;
    creditNoteId: string | null;
    creditNoteNumber: number | null;
  };
}

export async function closePeriod(input: {
  periodId: string;
}): Promise<{ periodId: string; status: string }> {
  const fn = httpsCallable(functions, 'closePeriod');
  const res = await fn(input);
  return res.data as { periodId: string; status: string };
}

export async function closeFiscalYear(input: {
  fiscalYear: number;
  asOfDate?: string;
}): Promise<{
  fiscalYear: number;
  periodsClosed: string[];
  journalId: string | null;
  journalNumber: number | null;
  netToRetainedEarningsCents: number;
}> {
  const fn = httpsCallable(functions, 'closeFiscalYear');
  const res = await fn(input);
  return res.data as {
    fiscalYear: number;
    periodsClosed: string[];
    journalId: string | null;
    journalNumber: number | null;
    netToRetainedEarningsCents: number;
  };
}

export async function recordInvoiceReminder(input: {
  invoiceId: string;
  channel?: 'email' | 'whatsapp' | 'manual';
  note?: string;
}): Promise<{
  invoiceId: string;
  invoiceNumber: number;
  reminderCount: number;
  channel: string;
  statementText: string;
  balanceCents: number;
}> {
  const fn = httpsCallable(functions, 'recordInvoiceReminder');
  const res = await fn(input);
  return res.data as {
    invoiceId: string;
    invoiceNumber: number;
    reminderCount: number;
    channel: string;
    statementText: string;
    balanceCents: number;
  };
}

export async function exportFinancePack(input: {
  startDate: string;
  endDate: string;
}): Promise<FinanceExportPack> {
  const fn = httpsCallable(functions, 'exportFinancePack');
  const res = await fn(input);
  return res.data as FinanceExportPack;
}

export async function ensurePhase2Accounts(): Promise<{ created: string[] }> {
  const fn = httpsCallable(functions, 'ensurePhase2Accounts');
  const res = await fn({});
  return res.data as { created: string[] };
}

export async function upsertSupplier(supplier: {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  vatNumber?: string;
  paymentTermsDays?: number;
  isActive?: boolean;
}): Promise<{ id: string }> {
  const fn = httpsCallable(functions, 'upsertSupplier');
  const res = await fn(supplier);
  return res.data as { id: string };
}

export async function createPurchaseOrder(input: {
  supplierId: string;
  lines: Array<{ itemId: string; qty: number; unitCostExVatCents: number }>;
  notes?: string;
  orderDate?: string;
}): Promise<{ purchaseOrderId: string; number: number }> {
  const fn = httpsCallable(functions, 'createPurchaseOrder');
  const res = await fn(input);
  return res.data as { purchaseOrderId: string; number: number };
}

export async function postGoodsReceipt(input: {
  purchaseOrderId: string;
  lines: Array<{ itemId: string; qty: number }>;
  date?: string;
}): Promise<{
  goodsReceiptId: string;
  number: number;
  journalId: string;
  totalInclCents: number;
}> {
  const fn = httpsCallable(functions, 'postGoodsReceipt');
  const res = await fn(input);
  return res.data as {
    goodsReceiptId: string;
    number: number;
    journalId: string;
    totalInclCents: number;
  };
}

export async function postSupplierBillFromGrn(input: {
  goodsReceiptId: string;
  supplierInvoiceRef?: string;
  billDate?: string;
}): Promise<{ billId: string; number: number; totalCents: number }> {
  const fn = httpsCallable(functions, 'postSupplierBillFromGrn');
  const res = await fn(input);
  return res.data as { billId: string; number: number; totalCents: number };
}

export async function paySupplierBill(input: {
  billId: string;
  amountCents: number;
  tender: 'bank' | 'cash';
  date?: string;
}): Promise<{
  paymentId: string;
  number: number;
  amountCents: number;
  billBalanceCents: number;
}> {
  const fn = httpsCallable(functions, 'paySupplierBill');
  const res = await fn(input);
  return res.data as {
    paymentId: string;
    number: number;
    amountCents: number;
    billBalanceCents: number;
  };
}

export async function importBankStatement(input: {
  lines: Array<{
    date: string;
    description: string;
    amountCents: number;
    reference?: string;
    externalId?: string;
  }>;
  statementDate?: string;
  label?: string;
}): Promise<{ statementId: string; number: number; lineCount: number }> {
  const fn = httpsCallable(functions, 'importBankStatement');
  const res = await fn(input);
  return res.data as { statementId: string; number: number; lineCount: number };
}

export async function reconcileBankLine(input: {
  bankLineId: string;
  matchType: 'supplier_payment' | 'card_clearing' | 'ignore';
  matchRef?: string;
}): Promise<{ bankLineId: string; status: string; journalId?: string }> {
  const fn = httpsCallable(functions, 'reconcileBankLine');
  const res = await fn(input);
  return res.data as { bankLineId: string; status: string; journalId?: string };
}

export type { JournalEntry };
