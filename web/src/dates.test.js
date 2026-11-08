import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { localKey, addDays, addMonths, weekDays, monthGrid, sameDay } from './dates.js';

test('local calendar key uses the local day, including late evening', () => {
  const evening = new Date(2026, 10, 7, 23, 30);
  assert.equal(localKey(evening), '2026-11-07');
  assert.equal(localKey(evening.toISOString()), '2026-11-07');
  assert.equal(localKey(addDays(new Date(2026, 2, 7, 23, 30), 1)), '2026-03-08');
  assert.equal(localKey(addDays(new Date(2026, 10, 1, 1, 30), 1)), '2026-11-02');
});

test('month navigation clamps the day and weeks start Sunday', () => {
  assert.equal(localKey(addMonths(new Date(2026, 0, 31), 1)), '2026-02-28');
  assert.equal(localKey(addMonths(new Date(2026, 0, 31), -1)), '2025-12-31');
  const week = weekDays(new Date(2026, 10, 7));
  assert.equal(localKey(week[0]), '2026-11-01');
  assert.equal(week[0].getDay(), 0);
  assert.equal(localKey(week[6]), '2026-11-07');
  const grid = monthGrid(new Date(2026, 10, 7));
  assert.equal(grid.length, 42);
  assert.equal(localKey(grid[0]), '2026-11-01');
  assert.equal(localKey(grid[29]), '2026-11-30');
  assert.equal(localKey(grid[30]), '2026-12-01');
  assert.equal(sameDay(grid[6], new Date(2026, 10, 7, 23, 59)), true);
});

test('US Eastern late evening does not roll onto the UTC date', () => {
  const script = `
    import { localKey } from ${JSON.stringify(new URL('./dates.js', import.meta.url).href)};
    const evening = new Date(2026, 10, 7, 23, 30);
    const utc = evening.toISOString().slice(0, 10);
    if (localKey(evening) !== '2026-11-07') process.exit(2);
    if (utc !== '2026-11-08') process.exit(3);
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
