import test from 'node:test';
import assert from 'node:assert/strict';
import { calc, mergeItems, diffParts, invoiceStatus } from './math.js';

test('quote math: parts + labor + tax', () => {
  const r = calc({ items: [{ price: 289.99, qty: 1 }, { price: 3.1, qty: 3 }], laborHours: 2.5, hourlyRate: 95, taxRate: 6.5 });
  assert.equal(r.parts, 299.29);
  assert.equal(r.labor, 237.5);
  assert.equal(r.subtotal, 536.79);
  assert.equal(r.tax, 34.89);
  assert.equal(r.total, 571.68);
});
test('no floating point drift', () => {
  assert.equal(calc({ items: [{ price: 0.1, qty: 3 }] }).total, 0.3);
});
test('zero tax and empty', () => {
  assert.deepEqual(calc({}), { parts: 0, labor: 0, subtotal: 0, tax: 0, total: 0 });
});
test('merge items across visits', () => {
  assert.deepEqual(mergeItems([[{ name: 'A', price: 2, qty: 1 }], [{ name: 'A', price: 2, qty: 2 }, { name: 'B', price: 1, qty: 0 }]]), [{ name: 'A', price: 2, qty: 3 }]);
});
test('parts diff', () => {
  const d = diffParts([{ name: 'A', qty: 2 }, { name: 'B', qty: 1 }], [{ name: 'A', qty: 3 }, { name: 'C', qty: 1 }]);
  assert.deepEqual(d, [{ name: 'A', quoted: 2, used: 3, delta: 1 }, { name: 'B', quoted: 1, used: 0, delta: -1 }, { name: 'C', quoted: 0, used: 1, delta: 1 }]);
});
test('invoice status', () => {
  assert.equal(invoiceStatus({ due_date: '2026-12-01' }, '2026-11-01'), 'unpaid');
  assert.equal(invoiceStatus({ due_date: '2026-12-01', viewed_at: 'x' }, '2026-11-01'), 'viewed');
  assert.equal(invoiceStatus({ due_date: '2026-10-01', viewed_at: 'x' }, '2026-11-01'), 'overdue');
  assert.equal(invoiceStatus({ due_date: '2026-10-01', paid_at: 'x' }, '2026-11-01'), 'paid');
});
