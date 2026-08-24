# Knapsak POS

Finance-first POS / ERP for Knapsak (ZAR, SA VAT). See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Quick start

```bash
cd ~/Desktop/knapsak_pos
npm install
npm run dev
```

### Grant POS access

```bash
cd ~/Desktop/knapsak_flutter/scripts
node set-pos-role.js you@example.com owner
# sign out / in so the ID token refreshes
```

### Deploy backend (rules + functions)

```bash
cd ~/Desktop/knapsak_flutter
firebase deploy --only firestore:rules,functions --project knapsak-app-887fc
```

Then in the POS UI (as owner): **Bootstrap finance**.

### Phase 1 flow

1. Add inventory items (Inventory)
2. Open till (POS) with opening float
3. Sell with cash/card — each pay posts journals + stock + COGS + VAT
4. Close till → Z-report
5. Exports → date range CSV pack (TB / IS / GL / VAT)

### Phase 2 flow

1. Dashboard → **Ensure Phase 2 accounts** (Bank 1120 + GRNI 2150)
2. Suppliers → add creditor
3. Purchasing → PO → Post GRN (stock + VAT input + GRNI) → Create bill (AP)
4. Bills → pay from bank/cash
5. Banking → paste CSV → match payment or clear card clearing

### Deploy UI

```bash
cd ~/Desktop/knapsak_pos
npm run deploy
```

> Hosting currently uses the default Firebase site — configure a second site (`knapsak-pos`) before production so it does not overwrite the supplier console.
