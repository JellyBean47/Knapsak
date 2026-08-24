const { todayInSA } = require('./money');

async function recordInvoiceReminder(db, admin, {
  uid,
  invoiceId,
  channel,
  note,
}) {
  if (!invoiceId || typeof invoiceId !== 'string') {
    throw Object.assign(new Error('invoiceId is required.'), {
      code: 'invalid-argument',
    });
  }
  const ch = channel === 'email' || channel === 'whatsapp' || channel === 'manual'
    ? channel
    : 'manual';

  const ref = db.collection('customerInvoices').doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error('Invoice not found.'), { code: 'not-found' });
  }
  const inv = snap.data();
  if (inv.status === 'paid' || inv.status === 'void') {
    throw Object.assign(new Error('Invoice is not open for reminders.'), {
      code: 'failed-precondition',
    });
  }

  const today = todayInSA();
  const reminderCount = (inv.reminderCount || 0) + 1;
  const reminderNote =
    typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;

  await ref.update({
    reminderCount,
    lastReminderAt: admin.firestore.FieldValue.serverTimestamp(),
    lastReminderDate: today,
    lastReminderChannel: ch,
    lastReminderNote: reminderNote,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('financeTimeline').add({
    anchorType: 'customer_invoice',
    anchorId: invoiceId,
    at: today,
    kind: 'reminder_sent',
    label: `Reminder #${reminderCount} (${ch})`,
    amountCents: inv.balanceCents ?? inv.totalCents,
    customerId: inv.customerId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  });

  await db.collection('financeAudit').add({
    type: 'invoice_reminder',
    invoiceId,
    invoiceNumber: inv.number,
    channel: ch,
    reminderCount,
    note: reminderNote,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  });

  return {
    invoiceId,
    invoiceNumber: inv.number,
    reminderCount,
    channel: ch,
    customerName: inv.customerName,
    balanceCents: inv.balanceCents ?? inv.totalCents,
    dueDate: inv.dueDate,
    statementText: [
      `Reminder: Invoice #${inv.number} for ${inv.customerName}`,
      `Amount due: R ${((inv.balanceCents ?? inv.totalCents) / 100).toFixed(2)}`,
      `Due date: ${inv.dueDate}`,
      `As of: ${today}`,
      reminderNote ? `Note: ${reminderNote}` : null,
    ].filter(Boolean).join('\n'),
  };
}

module.exports = { recordInvoiceReminder };
