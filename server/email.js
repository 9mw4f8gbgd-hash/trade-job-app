// Optional Resend module. Not called automatically anywhere in Phase 1.
export async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: true, reason: 'RESEND_API_KEY not set' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'onboarding@resend.dev', to, subject, html }),
  });
  return r.json();
}
