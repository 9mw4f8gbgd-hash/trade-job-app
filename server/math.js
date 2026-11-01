// All money math in integer cents to avoid float drift.
const cents = (n) => Math.round(Number(n || 0) * 100);

export function calc({ items = [], laborHours = 0, hourlyRate = 0, taxRate = 0 }) {
  const partsC = items.reduce((s, i) => s + Math.round(cents(i.price) * Number(i.qty || 0)), 0);
  const laborC = Math.round(cents(hourlyRate) * Number(laborHours || 0));
  const subC = partsC + laborC;
  const taxC = Math.round((subC * Number(taxRate || 0)) / 100); // taxRate is a percent, e.g. 6.5
  return { parts: partsC / 100, labor: laborC / 100, subtotal: subC / 100, tax: taxC / 100, total: (subC + taxC) / 100 };
}

// Merge line items by name, summing qty.
export function mergeItems(lists) {
  const m = new Map();
  for (const i of lists.flat()) {
    const cur = m.get(i.name) || { name: i.name, price: Number(i.price), qty: 0 };
    cur.qty += Number(i.qty || 0);
    m.set(i.name, cur);
  }
  return [...m.values()].filter((i) => i.qty > 0);
}

// Compare quoted items vs items actually used.
export function diffParts(quoted, used) {
  const names = new Set([...quoted.map((i) => i.name), ...used.map((i) => i.name)]);
  const q = Object.fromEntries(mergeItems([quoted]).map((i) => [i.name, i.qty]));
  const u = Object.fromEntries(mergeItems([used]).map((i) => [i.name, i.qty]));
  return [...names].map((name) => ({ name, quoted: q[name] || 0, used: u[name] || 0, delta: (u[name] || 0) - (q[name] || 0) }));
}

export function invoiceStatus(inv, today = new Date().toISOString().slice(0, 10)) {
  if (inv.paid_at) return 'paid';
  const due = typeof inv.due_date === 'string' ? inv.due_date.slice(0, 10) : new Date(inv.due_date).toISOString().slice(0, 10);
  if (due < today) return 'overdue';
  if (inv.viewed_at) return 'viewed';
  return 'unpaid';
}
