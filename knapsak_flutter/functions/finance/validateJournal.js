function validateJournalLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return 'Journal must have at least one line.';
  }

  let debits = 0;
  let credits = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const debit = line?.debitCents;
    const credit = line?.creditCents;
    if (!line?.accountCode || typeof line.accountCode !== 'string') {
      return `Line ${i + 1} is missing an account code.`;
    }
    if (!Number.isInteger(debit) || !Number.isInteger(credit)) {
      return `Line ${i + 1} debit/credit must be integer cents.`;
    }
    if (debit < 0 || credit < 0) {
      return `Line ${i + 1} cannot have negative debit/credit.`;
    }
    if (debit > 0 && credit > 0) {
      return `Line ${i + 1} cannot debit and credit together.`;
    }
    if (debit === 0 && credit === 0) {
      return `Line ${i + 1} must have a debit or credit.`;
    }
    debits += debit;
    credits += credit;
  }

  if (debits === 0 && credits === 0) {
    return 'Journal total cannot be zero.';
  }
  if (debits !== credits) {
    return `Journal is unbalanced (Dr ${debits} ≠ Cr ${credits}).`;
  }
  return null;
}

module.exports = { validateJournalLines };
