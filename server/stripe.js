// Stripe Checkout via REST, no SDK. Enabled only when STRIPE_SECRET_KEY is set.
export const paymentsConfigured = () => !!process.env.STRIPE_SECRET_KEY;

export async function createCheckout({ invoice, shopName, baseUrl }) {
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': process.env.STRIPE_CURRENCY || 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(Number(invoice.total) * 100)),
    'line_items[0][price_data][product_data][name]': `${shopName} invoice #${invoice.id}`,
    success_url: `${baseUrl}/#/i/${invoice.token}?paid=1`,
    cancel_url: `${baseUrl}/#/i/${invoice.token}`,
    'metadata[invoice_token]': invoice.token,
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Stripe error');
  return j.url;
}
