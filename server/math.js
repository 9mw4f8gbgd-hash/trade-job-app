// All money math in integer cents to avoid float drift.
const cents = (n) => Math.round(Number(n || 0) * 100);

export function calc({ items = [], laborHours = 0, hourlyRate = 0, taxRate = 0 }) {
  const partsC = items.reduce((s, i) => s + Math.round(cents(i.price) * Number(i.qty || 0)), 0);
  const laborC = Math.round(cents(hourlyRate) * Number(laborHours || 0));
  const subC = partsC + laborC;
  const taxC = Math.round((subC * Number(taxRate || 0)) / 100); // taxRate is a percent, e.g. 6.5
  return { parts: partsC / 100, labor: laborC / 100, subtotal: subC / 100, tax: taxC / 100, total: (subC + taxC) / 100 };
}

// Merge line items that share a name and unit price. A different price stays its own line
// so an edited or custom price is not replaced by another visit's price.
export function mergeItems(lists) {
  const m = new Map();
  for (const i of lists.flat()) {
    const qty = Number(i.qty || 0);
    if (!(qty > 0)) continue;
    const priceNum = Number(i.price);
    const price = Number.isFinite(priceNum) ? priceNum : 0;
    const key = `${i.name}\0${price}`;
    const cur = m.get(key) || { name: i.name, price, qty: 0 };
    cur.qty += qty;
    m.set(key, cur);
  }
  return [...m.values()];
}

// Compare quoted quantities vs quantities actually used. Prices are not part of the diff.
export function diffParts(quoted, used) {
  const sum = (items) => {
    const m = new Map();
    for (const i of items) {
      if (!i?.name) continue;
      m.set(i.name, (m.get(i.name) || 0) + Number(i.qty || 0));
    }
    return m;
  };
  const q = sum(quoted);
  const u = sum(used);
  const names = [];
  for (const i of [...quoted, ...used]) {
    if (i?.name && !names.includes(i.name)) names.push(i.name);
  }
  return names.map((name) => {
    const quotedQty = q.get(name) || 0;
    const usedQty = u.get(name) || 0;
    return { name, quoted: quotedQty, used: usedQty, delta: usedQty - quotedQty };
  });
}

export function invoiceStatus(inv, today = new Date().toISOString().slice(0, 10)) {
  if (inv.paid_at) return 'paid';
  const due = typeof inv.due_date === 'string' ? inv.due_date.slice(0, 10) : new Date(inv.due_date).toISOString().slice(0, 10);
  if (due < today) return 'overdue';
  if (inv.viewed_at) return 'viewed';
  return 'unpaid';
}
