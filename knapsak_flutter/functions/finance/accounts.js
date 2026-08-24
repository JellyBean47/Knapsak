async function loadTaggedAccounts(db) {
  const snap = await db.collection('accounts').where('isPosting', '==', true).get();
  const byTag = new Map();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.systemTag) {
      byTag.set(data.systemTag, { code: doc.id, ...data });
    }
  }
  return byTag;
}

function requireTag(byTag, tag) {
  const acct = byTag.get(tag);
  if (!acct) {
    throw Object.assign(new Error(`Missing system account tagged "${tag}". Bootstrap finance first.`), {
      code: 'failed-precondition',
    });
  }
  return acct.code;
}

module.exports = { loadTaggedAccounts, requireTag };
