import type { Cents } from './types';

export function assertCents(value: number, label = 'amount'): Cents {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents`);
  }
  return value;
}

export function formatZar(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}R${whole.toLocaleString('en-ZA')}.${frac}`;
}

/** Split a VAT-inclusive amount into ex-VAT + VAT at rateBps (e.g. 1500 = 15%). */
export function splitInclusiveVat(
  inclusiveCents: Cents,
  rateBps: number,
): { exVatCents: Cents; vatCents: Cents } {
  assertCents(inclusiveCents, 'inclusiveCents');
  if (!Number.isInteger(rateBps) || rateBps < 0) {
    throw new Error('rateBps must be a non-negative integer');
  }
  // ex = inclusive * 10000 / (10000 + rateBps), rounded to nearest cent
  const exVatCents = Math.round((inclusiveCents * 10_000) / (10_000 + rateBps));
  const vatCents = inclusiveCents - exVatCents;
  return { exVatCents, vatCents };
}

export function sumDebits(lines: { debitCents: number }[]): Cents {
  return lines.reduce((s, l) => s + l.debitCents, 0);
}

export function sumCredits(lines: { creditCents: number }[]): Cents {
  return lines.reduce((s, l) => s + l.creditCents, 0);
}
