// Active is the working list. Payment does not file a job away; Complete does.
export function filterJobs(jobs, filter) {
  const list = jobs || [];
  if (filter === 'completed') return list.filter((j) => j.completed_at);
  if (filter === 'all') return list.slice();
  return list.filter((j) => !j.completed_at);
}
