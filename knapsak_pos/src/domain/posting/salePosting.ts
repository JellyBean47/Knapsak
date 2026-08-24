import { splitInclusiveVat } from '../money';
import type { Cents, JournalLine, SystemAccountTag } from '../types';

export type TenderType = 'cash' | 'card';

/**
 * Build double-entry lines for a simple VAT-inclusive POS sale.
 * Used by Phase 1 UI / Functions — kept here as the shared contract.
 */
export function buildPosSaleLines(input: {
  tenderCents: Cents;
  tender: TenderType;
  vatRateBps: number;
  cogsCents: Cents;
  resolveAccount: (tag: SystemAccountTag) => string;
}): JournalLine[] {
  const { exVatCents, vatCents } = splitInclusiveVat(
    input.tenderCents,
    input.vatRateBps,
  );
  const tenderTag: SystemAccountTag =
    input.tender === 'cash' ? 'cash' : 'card_clearing';

  const lines: JournalLine[] = [
    {
      accountCode: input.resolveAccount(tenderTag),
      debitCents: input.tenderCents,
      creditCents: 0,
      memo: 'Tender',
    },
    {
      accountCode: input.resolveAccount('sales'),
      debitCents: 0,
      creditCents: exVatCents,
      memo: 'Sales ex VAT',
    },
  ];

  if (vatCents > 0) {
    lines.push({
      accountCode: input.resolveAccount('vat_output'),
      debitCents: 0,
      creditCents: vatCents,
      memo: 'VAT output',
    });
  }

  if (input.cogsCents > 0) {
    lines.push(
      {
        accountCode: input.resolveAccount('cogs'),
        debitCents: input.cogsCents,
        creditCents: 0,
        memo: 'Cost of sales',
      },
      {
        accountCode: input.resolveAccount('inventory'),
        debitCents: 0,
        creditCents: input.cogsCents,
        memo: 'Inventory relief',
      },
    );
  }

  return lines;
}

/** Reverse of a VAT-inclusive POS sale (credit note / refund). */
export function buildPosReturnLines(input: {
  tenderCents: Cents;
  tender: TenderType;
  vatRateBps: number;
  cogsCents: Cents;
  resolveAccount: (tag: SystemAccountTag) => string;
}): JournalLine[] {
  const { exVatCents, vatCents } = splitInclusiveVat(
    input.tenderCents,
    input.vatRateBps,
  );
  const tenderTag: SystemAccountTag =
    input.tender === 'cash' ? 'cash' : 'card_clearing';

  const lines: JournalLine[] = [
    {
      accountCode: input.resolveAccount('sales'),
      debitCents: exVatCents,
      creditCents: 0,
      memo: 'Sales return ex VAT',
    },
  ];

  if (vatCents > 0) {
    lines.push({
      accountCode: input.resolveAccount('vat_output'),
      debitCents: vatCents,
      creditCents: 0,
      memo: 'VAT output reverse',
    });
  }

  lines.push({
    accountCode: input.resolveAccount(tenderTag),
    debitCents: 0,
    creditCents: input.tenderCents,
    memo: 'Refund tender',
  });

  if (input.cogsCents > 0) {
    lines.push(
      {
        accountCode: input.resolveAccount('inventory'),
        debitCents: input.cogsCents,
        creditCents: 0,
        memo: 'Inventory restore',
      },
      {
        accountCode: input.resolveAccount('cogs'),
        debitCents: 0,
        creditCents: input.cogsCents,
        memo: 'COGS reverse',
      },
    );
  }

  return lines;
}

/** Weighted-average receipt: new average cost after receiving stock. */
export function weightedAverageAfterReceipt(
  qtyOnHand: number,
  avgCostCents: Cents,
  recvQty: number,
  recvUnitCostCents: Cents,
): { qtyAfter: number; avgCostAfterCents: Cents; stockValueAfterCents: Cents } {
  if (recvQty <= 0) {
    throw new Error('recvQty must be positive');
  }
  const qtyAfter = qtyOnHand + recvQty;
  const valueBefore = qtyOnHand * avgCostCents;
  const valueRecv = recvQty * recvUnitCostCents;
  const stockValueAfterCents = valueBefore + valueRecv;
  const avgCostAfterCents =
    qtyAfter === 0 ? 0 : Math.round(stockValueAfterCents / qtyAfter);
  return { qtyAfter, avgCostAfterCents, stockValueAfterCents };
}
