/** Extra Phase 2 accounts — created on bootstrap and ensured for older orgs. */

const PHASE2_ACCOUNTS = [
  {
    code: '1120',
    name: 'Bank account',
    type: 'asset',
    subtype: 'bank',
    normalBalance: 'debit',
    isPosting: true,
    isActive: true,
    systemTag: 'bank',
    sortOrder: 1120,
    balanceCents: 0,
    vatRateId: null,
  },
  {
    code: '2150',
    name: 'Goods received not invoiced',
    type: 'liability',
    normalBalance: 'credit',
    isPosting: true,
    isActive: true,
    systemTag: 'grni',
    sortOrder: 2150,
    balanceCents: 0,
    vatRateId: null,
    subtype: null,
  },
];

async function ensurePhase2Accounts(db) {
  const created = [];
  for (const acct of PHASE2_ACCOUNTS) {
    const ref = db.collection('accounts').doc(acct.code);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set(acct);
      created.push(acct.code);
    } else if (!snap.data().systemTag && acct.systemTag) {
      await ref.set({ systemTag: acct.systemTag }, { merge: true });
    }
  }
  return created;
}

module.exports = { PHASE2_ACCOUNTS, ensurePhase2Accounts };
