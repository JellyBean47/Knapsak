function splitInclusiveVat(inclusiveCents, rateBps) {
  if (!Number.isInteger(inclusiveCents)) {
    throw Object.assign(new Error('inclusiveCents must be integer cents'), {
      code: 'invalid-argument',
    });
  }
  if (!Number.isInteger(rateBps) || rateBps < 0) {
    throw Object.assign(new Error('rateBps must be a non-negative integer'), {
      code: 'invalid-argument',
    });
  }
  const exVatCents = Math.round((inclusiveCents * 10_000) / (10_000 + rateBps));
  return { exVatCents, vatCents: inclusiveCents - exVatCents };
}

function todayInSA() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
  }).format(new Date());
}

module.exports = { splitInclusiveVat, todayInSA };
