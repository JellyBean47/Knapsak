import type { VatRate } from '../types';

/**
 * Default SA VAT rates for retail bootstrap.
 *
 * CONFIRM WITH ACCOUNTANT before treating as compliance:
 * - Which grocery lines are zero-rated vs standard-rated
 * - Exempt supplies handling
 * - VAT201 box mapping for exports
 * - Tax invoice field requirements
 */
export const SA_DEFAULT_VAT_RATES: VatRate[] = [
  {
    id: 'za-std-15',
    name: 'Standard rated (15%)',
    rateBps: 1500,
    category: 'standard',
  },
  {
    id: 'za-zero',
    name: 'Zero-rated (0%)',
    rateBps: 0,
    category: 'zero',
  },
  {
    id: 'za-exempt',
    name: 'Exempt',
    rateBps: 0,
    category: 'exempt',
  },
];

export const SA_DEFAULT_VAT_RATE_ID = 'za-std-15';

export const VAT_ACCOUNTANT_CONFIRMATION = [
  'Confirm standard vs zero-rated vs exempt product categories for your assortment.',
  'Confirm whether shelf prices are VAT-inclusive (we default yes for retail).',
  'Confirm VAT201 / practitioner export column mapping before tax season.',
  'Confirm tax invoice / credit note legal wording and required fields.',
  'Do not claim SARS certification without external sign-off.',
] as const;
