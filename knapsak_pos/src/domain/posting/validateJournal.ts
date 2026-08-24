import { assertCents, sumCredits, sumDebits } from '../money';
import type { JournalLine } from '../types';

export interface JournalValidationError {
  code:
    | 'empty'
    | 'unbalanced'
    | 'zero_total'
    | 'line_both_sides'
    | 'line_neither_side'
    | 'negative'
    | 'missing_account';
  message: string;
}

export function validateJournalLines(
  lines: JournalLine[],
): JournalValidationError | null {
  if (!lines.length) {
    return { code: 'empty', message: 'Journal must have at least one line.' };
  }

  for (const [i, line] of lines.entries()) {
    try {
      assertCents(line.debitCents, `lines[${i}].debitCents`);
      assertCents(line.creditCents, `lines[${i}].creditCents`);
    } catch (e) {
      return {
        code: 'negative',
        message: e instanceof Error ? e.message : 'Invalid cents',
      };
    }

    if (!line.accountCode?.trim()) {
      return {
        code: 'missing_account',
        message: `Line ${i + 1} is missing an account code.`,
      };
    }
    if (line.debitCents < 0 || line.creditCents < 0) {
      return {
        code: 'negative',
        message: `Line ${i + 1} cannot have negative debit/credit.`,
      };
    }
    if (line.debitCents > 0 && line.creditCents > 0) {
      return {
        code: 'line_both_sides',
        message: `Line ${i + 1} cannot debit and credit together.`,
      };
    }
    if (line.debitCents === 0 && line.creditCents === 0) {
      return {
        code: 'line_neither_side',
        message: `Line ${i + 1} must have a debit or credit.`,
      };
    }
  }

  const debits = sumDebits(lines);
  const credits = sumCredits(lines);
  if (debits === 0 && credits === 0) {
    return { code: 'zero_total', message: 'Journal total cannot be zero.' };
  }
  if (debits !== credits) {
    return {
      code: 'unbalanced',
      message: `Journal is unbalanced (Dr ${debits} ≠ Cr ${credits}).`,
    };
  }

  return null;
}
