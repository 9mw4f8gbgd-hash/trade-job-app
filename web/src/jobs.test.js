import test from 'node:test';
import assert from 'node:assert/strict';
import { filterJobs } from './jobs.js';

const jobs = [
  { id: 1, status: 'invoiced', completed_at: null },
  { id: 2, status: 'paid', completed_at: null },
  { id: 3, status: 'invoiced', completed_at: '2026-11-07T18:00:00.000Z' },
  { id: 4, status: 'paid', completed_at: '2026-11-06T18:00:00.000Z' },
];

test('active list hides completed jobs and keeps unpaid and paid work', () => {
  assert.deepEqual(filterJobs(jobs, 'active').map((j) => j.id), [1, 2]);
  assert.deepEqual(filterJobs(jobs, 'completed').map((j) => j.id), [3, 4]);
  assert.deepEqual(filterJobs(jobs, 'all').map((j) => j.id), [1, 2, 3, 4]);
});

test('reopening returns a job to active without dropping it from history views', () => {
  const reopened = jobs.map((j) => (j.id === 3 ? { ...j, completed_at: null } : j));
  assert.deepEqual(filterJobs(reopened, 'active').map((j) => j.id), [1, 2, 3]);
  assert.deepEqual(filterJobs(reopened, 'completed').map((j) => j.id), [4]);
  assert.equal(filterJobs(reopened, 'all').length, 4);
});
