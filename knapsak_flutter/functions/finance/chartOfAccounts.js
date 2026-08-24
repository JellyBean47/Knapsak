/** SA retail Chart of Accounts seed — keep in sync with knapsak_pos domain defaults. */

const SA_DEFAULT_VAT_RATE_ID = 'za-std-15';

const SA_RETAIL_CHART_OF_ACCOUNTS = [
  { code: '1000', name: 'Assets', type: 'asset', normalBalance: 'debit', isPosting: false, isActive: true, sortOrder: 1000 },
  { code: '1100', name: 'Cash on hand', type: 'asset', subtype: 'bank', normalBalance: 'debit', isPosting: true, isActive: true, systemTag: 'cash', sortOrder: 1100 },
  { code: '1110', name: 'Card clearing', type: 'asset', subtype: 'bank', normalBalance: 'debit', isPosting: true, isActive: true, systemTag: 'card_clearing', sortOrder: 1110 },
  { code: '1120', name: 'Bank account', type: 'asset', subtype: 'bank', normalBalance: 'debit', isPosting: true, isActive: true, systemTag: 'bank', sortOrder: 1120 },
  { code: '1200', name: 'Accounts receivable', type: 'asset', normalBalance: 'debit', isPosting: true, isActive: true, systemTag: 'accounts_receivable', sortOrder: 1200 },
  { code: '1300', name: 'Inventory', type: 'asset', normalBalance: 'debit', isPosting: true, isActive: true, systemTag: 'inventory', sortOrder: 1300 },
  { code: '1400', name: 'VAT input (control)', type: 'asset', subtype: 'vatControl', normalBalance: 'debit', isPosting: true, isActive: true, systemTag: 'vat_input', vatRateId: SA_DEFAULT_VAT_RATE_ID, sortOrder: 1400 },
  { code: '2000', name: 'Liabilities', type: 'liability', normalBalance: 'credit', isPosting: false, isActive: true, sortOrder: 2000 },
  { code: '2100', name: 'Accounts payable', type: 'liability', normalBalance: 'credit', isPosting: true, isActive: true, systemTag: 'accounts_payable', sortOrder: 2100 },
  { code: '2150', name: 'Goods received not invoiced', type: 'liability', normalBalance: 'credit', isPosting: true, isActive: true, systemTag: 'grni', sortOrder: 2150 },
  { code: '2200', name: 'VAT output (control)', type: 'liability', subtype: 'vatControl', normalBalance: 'credit', isPosting: true, isActive: true, systemTag: 'vat_output', vatRateId: SA_DEFAULT_VAT_RATE_ID, sortOrder: 2200 },
  { code: '3000', name: 'Equity', type: 'equity', normalBalance: 'credit', isPosting: false, isActive: true, sortOrder: 3000 },
  { code: '3100', name: 'Owner equity', type: 'equity', normalBalance: 'credit', isPosting: true, isActive: true, systemTag: 'owner_equity', sortOrder: 3100 },
  { code: '3200', name: 'Retained earnings', type: 'equity', normalBalance: 'credit', isPosting: true, isActive: true, systemTag: 'retained_earnings', sortOrder: 3200 },
  { code: '4000', name: 'Income', type: 'income', normalBalance: 'credit', isPosting: false, isActive: true, sortOrder: 4000 },
  { code: '4100', name: 'Retail sales', type: 'income', normalBalance: 'credit', isPosting: true, isActive: true, systemTag: 'sales', vatRateId: SA_DEFAULT_VAT_RATE_ID, sortOrder: 4100 },
  { code: '4200', name: 'Sales discounts', type: 'income', normalBalance: 'debit', isPosting: true, isActive: true, systemTag: 'sales_discounts', sortOrder: 4200 },
  { code: '5000', name: 'Expenses', type: 'expense', normalBalance: 'debit', isPosting: false, isActive: true, sortOrder: 5000 },
  { code: '5100', name: 'Cost of sales', type: 'expense', normalBalance: 'debit', isPosting: true, isActive: true, systemTag: 'cogs', sortOrder: 5100 },
  { code: '5200', name: 'Inventory adjustments', type: 'expense', normalBalance: 'debit', isPosting: true, isActive: true, systemTag: 'inventory_adjustments', sortOrder: 5200 },
];

const SA_DEFAULT_VAT_RATES = [
  { id: 'za-std-15', name: 'Standard rated (15%)', rateBps: 1500, category: 'standard' },
  { id: 'za-zero', name: 'Zero-rated (0%)', rateBps: 0, category: 'zero' },
  { id: 'za-exempt', name: 'Exempt', rateBps: 0, category: 'exempt' },
];

module.exports = {
  SA_RETAIL_CHART_OF_ACCOUNTS,
  SA_DEFAULT_VAT_RATES,
  SA_DEFAULT_VAT_RATE_ID,
};
