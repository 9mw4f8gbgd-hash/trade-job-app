import React, { useEffect, useState, useCallback } from 'react';
import { api, auth, saveVisit, queued, fmt, uid } from './api.js';

const useHash = () => {
  const [h, setH] = useState(location.hash.slice(1) || '/');
  useEffect(() => { const f = () => setH(location.hash.slice(1) || '/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h.split('?')[0];
};
const go = (p) => (location.hash = '#' + p);
const STATUSES = ['new', 'scheduled', 'quoted', 'approved', 'done', 'invoiced', 'paid'];
const METHODS = ['check', 'cash', 'venmo', 'card', 'other'];
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const reload = useCallback(() => fn().then(setData).catch((e) => setErr(e.message)), deps);
  useEffect(() => { reload(); }, [reload]);
  return [data, reload, err];
}

export default function App() {
  const path = useHash();
  const [token, setToken] = useState(auth.token);
  if (path.startsWith('/q/')) return <PublicQuote token={path.slice(3)} />;
  if (path.startsWith('/i/')) return <PublicInvoice token={path.slice(3)} />;
  if (path.startsWith('/magic/')) { auth.token = path.slice(7); setTimeout(() => { setToken(auth.token); go('/'); }); return null; }
  if (!token) return <Login onIn={(t) => { auth.token = t; setToken(t); }} />;
  let screen;
  if (path.startsWith('/job/') && path.endsWith('/visit')) screen = <Visit jobId={path.split('/')[2]} />;
  else if (path.startsWith('/job/')) screen = <Job id={path.split('/')[2]} />;
  else if (path === '/new') screen = <JobForm />;
  else if (path === '/schedule') screen = <Schedule />;
  else if (path === '/money') screen = <Money />;
  else if (path === '/settings') screen = <Settings />;
  else screen = <Jobs />;
  const tab = path.startsWith('/schedule') ? 'schedule' : path.startsWith('/money') ? 'money' : path.startsWith('/settings') ? 'settings' : 'jobs';
  return (
    <>
      <OfflineBar />
      <main>{screen}</main>
      <nav className="bottom">
        {[['jobs', '/', 'Jobs'], ['schedule', '/schedule', 'Schedule'], ['money', '/money', 'Money'], ['settings', '/settings', 'Settings']].map(([k, p, l]) => (
          <a key={k} href={'#' + p} className={tab === k ? 'on' : ''}>{l}</a>
        ))}
      </nav>
    </>
  );
}

function OfflineBar() {
  const [online, setOnline] = useState(navigator.onLine);
  const [n, setN] = useState(queued().length);
  useEffect(() => {
    const f = () => { setOnline(navigator.onLine); setN(queued().length); };
    ['online', 'offline', 'queue'].forEach((e) => addEventListener(e, f));
    return () => ['online', 'offline', 'queue'].forEach((e) => removeEventListener(e, f));
  }, []);
  if (online && !n) return null;
  return <div className="bar">{online ? `Syncing ${n} saved visit(s)...` : `Offline. ${n} visit(s) saved on this phone, will sync later.`}</div>;
}

function Login({ onIn }) {
  const [email, setEmail] = useState('owner@demo.test');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const submit = async (e) => { e.preventDefault(); try { onIn((await api('/auth/login', { email, password })).token); } catch (e) { setMsg(e.message); } };
  return (
    <main className="login">
      <h1>Shop Jobs</h1>
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="big">Log in</button>
      </form>
      <button className="link" onClick={async () => setMsg((await api('/auth/magic', { email })).message)}>Email me a login link instead</button>
      {msg && <p className="msg">{msg}</p>}
    </main>
  );
}

function Jobs() {
  const [jobs] = useLoad(() => api('/jobs'), []);
  const [filter, setFilter] = useState('open');
  const list = (jobs || []).filter((j) => (filter === 'open' ? j.status !== 'paid' : true));
  return (
    <>
      <header><h1>Jobs</h1><button className="add" onClick={() => go('/new')}>+ New job</button></header>
      <div className="seg">{['open', 'all'].map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{cap(f)}</button>)}</div>
      {!jobs && <p>Loading...</p>}
      {list.map((j) => <JobRow key={j.id} j={j} />)}
      {jobs && !list.length && <p className="muted">No jobs yet. Tap New job to add one.</p>}
    </>
  );
}
const JobRow = ({ j }) => (
  <a className="card row" href={`#/job/${j.id}`}>
    <div><b>{j.customer_name}</b><div className="muted">{j.address}</div>{j.scheduled_at && <div className="muted">{new Date(j.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>}</div>
    <span className={'pill ' + j.status}>{cap(j.status)}</span>
  </a>
);

const toLocalInput = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');
function JobForm({ job, onSaved }) {
  const [f, setF] = useState(job ? { ...job, scheduled_at: toLocalInput(job.scheduled_at) } : { customer_name: '', phone: '', address: '', notes: '', status: 'new', scheduled_at: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    const body = { ...f, scheduled_at: f.scheduled_at ? new Date(f.scheduled_at).toISOString() : null };
    if (body.scheduled_at && body.status === 'new') body.status = 'scheduled';
    try { const r = job ? await api(`/jobs/${job.id}`, body, 'PUT') : await api('/jobs', body); onSaved ? onSaved() : go(`/job/${r.id}`); } catch (e) { setErr(e.message); }
  };
  return (
    <form onSubmit={save} className="card">
      {!job && <h1>New job</h1>}
      <label>Customer name<input value={f.customer_name} onChange={set('customer_name')} required /></label>
      <label>Phone<input type="tel" value={f.phone} onChange={set('phone')} /></label>
      <label>Address<input value={f.address} onChange={set('address')} /></label>
      <label>When<input type="datetime-local" value={f.scheduled_at} onChange={set('scheduled_at')} /></label>
      <label>Status<select value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></label>
      <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
      {err && <p className="msg">{err}</p>}
      <button className="big">Save job</button>
    </form>
  );
}

function share(url, title) {
  if (navigator.share) navigator.share({ title, url }).catch(() => {});
  else navigator.clipboard.writeText(url).then(() => alert('Link copied. Paste it in a text or email.'));
}
const ShareRow = ({ url, title }) => (
  <div className="btns">
    <button onClick={() => navigator.clipboard.writeText(url).then(() => alert('Link copied'))}>Copy link</button>
    <button onClick={() => share(url, title)}>Share</button>
    <a className="btn" href={url} target="_blank">Open</a>
  </div>
);

function Job({ id }) {
  const [d, reload, err] = useLoad(() => api(`/jobs/${id}`), [id]);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState('');
  if (err) return <p className="msg">{err}</p>;
  if (!d) return <p>Loading...</p>;
  const { job, visits, quote, used, diff, invoice } = d;
  const pending = queued().filter((v) => String(v.job_id) === String(id));
  const act = async (label, fn) => { setBusy(label); try { await fn(); await reload(); } catch (e) { alert(e.message); } setBusy(''); };
  const origin = location.origin;
  return (
    <>
      <header><a href="#/" className="back">Back</a><span className={'pill ' + job.status}>{cap(job.status)}</span></header>
      {edit ? <JobForm job={job} onSaved={() => { setEdit(false); reload(); }} /> : (
        <section className="card">
          <h1>{job.customer_name}</h1>
          {job.phone && <a className="btn" href={`tel:${job.phone}`}>Call {job.phone}</a>}
          {job.address && <a className="btn" href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank">Map: {job.address}</a>}
          {job.notes && <p>{job.notes}</p>}
          <button onClick={() => setEdit(true)}>Edit job</button>
        </section>
      )}

      <section className="card">
        <h2>Site visits</h2>
        {visits.map((v) => (
          <div key={v.id} className="sub">
            <div className="muted">{new Date(v.created_at).toLocaleString()}</div>
            {v.items.map((i) => <div key={i.name}>{i.qty} x {i.name}</div>)}
            <div>Labor: {Number(v.labor_hours)} hr</div>
            {v.notes && <p>{v.notes}</p>}
            <div className="photos">{v.photos.map((p, k) => <img key={k} src={p} />)}</div>
          </div>
        ))}
        {pending.length > 0 && <p className="muted">{pending.length} visit(s) waiting to sync.</p>}
        <button className="big" onClick={() => go(`/job/${id}/visit`)}>+ Add site visit</button>
      </section>

      <section className="card">
        <h2>Quote</h2>
        {quote ? (
          <>
            <Totals doc={quote} />
            {quote.approved_at ? <p className="ok">Approved by customer {new Date(quote.approved_at).toLocaleDateString()}</p> : <p className="muted">Not approved yet. Send the link yourself.</p>}
            <ShareRow url={`${origin}/#/q/${quote.token}`} title="Your quote" />
            <button disabled={!!busy} onClick={() => act('q', () => api(`/jobs/${id}/quote`, {}))}>Redo quote from visits</button>
          </>
        ) : <button className="big" disabled={!visits.length || !!busy} onClick={() => act('q', () => api(`/jobs/${id}/quote`, {}))}>{visits.length ? 'Make quote from visits' : 'Add a visit first'}</button>}
      </section>

      {used && <PartsUsed id={id} used={used} diff={diff} onSaved={reload} />}

      <section className="card">
        <h2>Invoice</h2>
        {invoice ? (
          <>
            <Totals doc={invoice} />
            <p><span className={'pill ' + invoice.status}>{cap(invoice.status)}</span> Due {String(invoice.due_date).slice(0, 10)}</p>
            {invoice.paid_at ? <p className="ok">Paid by {cap(invoice.paid_method)}{invoice.paid_note ? ` (${invoice.paid_note})` : ''} on {new Date(invoice.paid_at).toLocaleDateString()}</p>
              : <MarkPaid id={invoice.id} onDone={reload} />}
            <ShareRow url={`${origin}/#/i/${invoice.token}`} title="Your invoice" />
            {!invoice.paid_at && <button disabled={!!busy} onClick={() => confirm('Make a new invoice from parts used?') && act('i', () => api(`/jobs/${id}/invoice`, {}))}>Redo invoice</button>}
          </>
        ) : <button className="big" disabled={!used || !!busy} onClick={() => act('i', () => api(`/jobs/${id}/invoice`, {}))}>{used ? 'Make invoice from parts used' : 'Make a quote first'}</button>}
      </section>
    </>
  );
}

function MarkPaid({ id, onDone }) {
  const [method, setMethod] = useState('check');
  const [note, setNote] = useState('');
  const save = async () => { try { await api(`/invoices/${id}/paid`, { method, note }); onDone(); } catch (e) { alert(e.message); } };
  return (
    <div className="sub">
      <b>Got paid?</b>
      <div className="seg wrap">{METHODS.map((m) => <button key={m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>{cap(m)}</button>)}</div>
      <input placeholder={method === 'check' ? 'Check number (optional)' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="big green" onClick={save}>Mark paid by {cap(method)}</button>
    </div>
  );
}

function Totals({ doc }) {
  return (
    <table>
      <tbody>
        {doc.items.map((i) => <tr key={i.name}><td>{i.qty} x {i.name}</td><td>{fmt(i.price * i.qty)}</td></tr>)}
        <tr><td>Labor {Number(doc.labor_hours)} hr at {fmt(doc.hourly_rate)}</td><td>{fmt(doc.labor)}</td></tr>
        <tr className="muted"><td>Subtotal</td><td>{fmt(doc.subtotal)}</td></tr>
        <tr className="muted"><td>Tax {Number(doc.tax_rate)}%</td><td>{fmt(doc.tax)}</td></tr>
        <tr className="total"><td>Total</td><td>{fmt(doc.total)}</td></tr>
      </tbody>
    </table>
  );
}

function PartsUsed({ id, used, diff, onSaved }) {
  const [items, setItems] = useState(used.items);
  const [labor, setLabor] = useState(used.labor_hours);
  const [extra, setExtra] = useState('');
  const parts = cachedParts();
  const upd = (k, patch) => setItems(items.map((i, n) => (n === k ? { ...i, ...patch } : i)));
  const add = () => { const p = parts.find((p) => p.name === extra); if (p) setItems([...items, { name: p.name, price: p.price, qty: 1, used: true }]); setExtra(''); };
  const save = async () => { await api(`/jobs/${id}/used`, { items, labor_hours: labor }, 'PUT'); onSaved(); };
  return (
    <section className="card">
      <h2>Parts used</h2>
      <p className="muted">Check off what you actually used.</p>
      {items.map((i, k) => (
        <div key={k} className="check">
          <label><input type="checkbox" checked={i.used} onChange={(e) => upd(k, { used: e.target.checked })} /> {i.name}</label>
          <input type="number" inputMode="decimal" value={i.qty} onChange={(e) => upd(k, { qty: e.target.value })} />
        </div>
      ))}
      <div className="check">
        <select value={extra} onChange={(e) => setExtra(e.target.value)}><option value="">Add another part...</option>{parts.map((p) => <option key={p.id}>{p.name}</option>)}</select>
        <button onClick={add}>Add</button>
      </div>
      <label>Final labor hours<input type="number" inputMode="decimal" step="0.25" value={labor} onChange={(e) => setLabor(e.target.value)} /></label>
      <button className="big" onClick={save}>Save parts used</button>
      {diff && diff.some((x) => x.delta) && (
        <div className="sub"><b>Changes vs quote</b>{diff.filter((x) => x.delta).map((x) => <div key={x.name}>{x.name}: quoted {x.quoted}, used {x.used} ({x.delta > 0 ? '+' : ''}{x.delta})</div>)}</div>
      )}
    </section>
  );
}

const cachedParts = () => JSON.parse(localStorage.getItem('parts') || '[]');
function Visit({ jobId }) {
  const [parts, setParts] = useState(cachedParts());
  const [cart, setCart] = useState({});
  const [labor, setLabor] = useState(1);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [search, setSearch] = useState('');
  useEffect(() => { api('/parts').then((p) => { localStorage.setItem('parts', JSON.stringify(p)); setParts(p); }).catch(() => {}); }, []);
  const bump = (p, n) => setCart((c) => { const q = Math.max(0, (c[p.name]?.qty || 0) + n); const x = { ...c, [p.name]: { name: p.name, price: p.price, qty: q } }; if (!q) delete x[p.name]; return x; });
  const addPhoto = (e) => [...e.target.files].forEach((f) => shrink(f).then((d) => setPhotos((p) => [...p, d])));
  const save = async () => {
    await saveVisit({ client_id: uid(), job_id: Number(jobId), labor_hours: Number(labor), notes, photos, items: Object.values(cart) });
    go(`/job/${jobId}`);
  };
  const shown = parts.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <header><a href={`#/job/${jobId}`} className="back">Back</a><h1>Site visit</h1></header>
      <input placeholder="Search parts" value={search} onChange={(e) => setSearch(e.target.value)} />
      {!parts.length && <p className="muted">Parts list not loaded yet. Open this once while online.</p>}
      <div className="parts">
        {shown.map((p) => (
          <div key={p.id} className={'part' + (cart[p.name] ? ' on' : '')}>
            <button className="pname" onClick={() => bump(p, 1)}>{p.name}<small>{fmt(p.price)}</small></button>
            {cart[p.name] && <div className="qty"><button onClick={() => bump(p, -1)}>-</button><b>{cart[p.name].qty}</b><button onClick={() => bump(p, 1)}>+</button></div>}
          </div>
        ))}
      </div>
      <section className="card">
        <label>Labor hours<input type="number" inputMode="decimal" step="0.25" value={labor} onChange={(e) => setLabor(e.target.value)} /></label>
        <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you find?" /></label>
        <label className="btn">Add photo<input type="file" accept="image/*" capture="environment" multiple hidden onChange={addPhoto} /></label>
        <div className="photos">{photos.map((p, k) => <img key={k} src={p} />)}</div>
        <button className="big green" onClick={save}>Save visit ({Object.keys(cart).length} parts)</button>
      </section>
    </>
  );
}
function shrink(file) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.7));
    };
    img.src = URL.createObjectURL(file);
  });
}

function Schedule() {
  const [day, setDay] = useState(() => new Date());
  const [jobs] = useLoad(() => api('/jobs'), []);
  const key = day.toDateString();
  const list = (jobs || []).filter((j) => j.scheduled_at && new Date(j.scheduled_at).toDateString() === key);
  const shift = (n) => setDay((d) => new Date(d.getTime() + n * 864e5));
  return (
    <>
      <header><h1>Schedule</h1><button className="add" onClick={() => go('/new')}>+ New job</button></header>
      <div className="seg"><button onClick={() => shift(-1)}>Prev</button><button onClick={() => setDay(new Date())}>Today</button><button onClick={() => shift(1)}>Next</button></div>
      <h2>{day.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
      {list.map((j) => <JobRow key={j.id} j={j} />)}
      {jobs && !list.length && <p className="muted">Nothing scheduled this day.</p>}
    </>
  );
}

function Money() {
  const [d] = useLoad(() => api('/money'), []);
  if (!d) return <p>Loading...</p>;
  return (
    <>
      <header><h1>Money</h1></header>
      <div className="grid">
        {['unpaid', 'viewed', 'overdue', 'paid'].map((s) => (
          <div key={s} className={'stat ' + s}><small>{cap(s)}</small><b>{fmt(d.summary[s].amount)}</b><small>{d.summary[s].count} invoice(s)</small></div>
        ))}
      </div>
      {d.invoices.map((i) => (
        <a key={i.id} className="card row" href={`#/job/${i.job_id}`}>
          <div><b>{i.customer_name}</b><div className="muted">{i.status === 'paid' ? `Paid by ${cap(i.paid_method)}${i.paid_note ? ` (${i.paid_note})` : ''}` : `Due ${String(i.due_date).slice(0, 10)}`}</div></div>
          <div className="right"><b>{fmt(i.total)}</b><span className={'pill ' + i.status}>{cap(i.status)}</span></div>
        </a>
      ))}
      {!d.invoices.length && <p className="muted">No invoices yet.</p>}
    </>
  );
}

function Settings() {
  const [me, reload] = useLoad(() => api('/me'), []);
  const [users, reloadUsers] = useLoad(() => api('/users'), []);
  const [cfg] = useLoad(() => api('/config'), []);
  const [s, setS] = useState(null);
  const [nu, setNu] = useState({ email: '', name: '', password: '' });
  useEffect(() => { if (me) setS(me.shop); }, [me]);
  if (!s) return <p>Loading...</p>;
  const save = async () => { await api('/settings', s, 'PUT'); reload(); alert('Saved'); };
  const addUser = async (e) => { e.preventDefault(); try { await api('/users', nu); setNu({ email: '', name: '', password: '' }); reloadUsers(); } catch (e) { alert(e.message); } };
  return (
    <>
      <header><h1>Settings</h1></header>
      <section className="card">
        <label>Shop name<input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></label>
        <label>Hourly labor rate ($)<input type="number" inputMode="decimal" value={s.hourly_rate} onChange={(e) => setS({ ...s, hourly_rate: e.target.value })} /></label>
        <label>Tax rate (%)<input type="number" inputMode="decimal" step="0.01" value={s.tax_rate} onChange={(e) => setS({ ...s, tax_rate: e.target.value })} /></label>
        <button className="big" onClick={save}>Save settings</button>
      </section>
      <section className="card">
        <h2>Card payments</h2>
        {cfg?.payments ? <p className="ok">Online card payments are on (Stripe).</p> : <p className="muted">Online payments not configured. Customers can pay by check, cash, or Venmo and you mark the invoice paid.</p>}
      </section>
      <section className="card">
        <h2>People</h2>
        {(users || []).map((u) => <div key={u.id}>{u.name || u.email} <span className="muted">{u.email}</span></div>)}
        <form onSubmit={addUser}>
          <input placeholder="Name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
          <input type="email" placeholder="Email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required />
          <input type="password" placeholder="Password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required />
          <button>Add person</button>
        </form>
      </section>
      <p className="muted">Logged in as {me.user.email}</p>
      <button onClick={() => { auth.token = null; location.reload(); }}>Log out</button>
    </>
  );
}

function PublicQuote({ token }) {
  const [d, reload, err] = useLoad(() => api(`/public/quote/${token}`), [token]);
  if (err) return <main><p className="msg">{err}</p></main>;
  if (!d) return <main><p>Loading...</p></main>;
  return (
    <main className="public">
      <h1>{d.shop.name}</h1>
      <p>Quote for {d.job.customer_name}<br /><span className="muted">{d.job.address}</span></p>
      {d.quote.notes && <p>{d.quote.notes}</p>}
      <Totals doc={d.quote} />
      {d.quote.approved_at ? <p className="ok big-text">Approved. Thank you!</p>
        : <button className="big green" onClick={() => api(`/public/quote/${token}/approve`, {}).then(reload)}>Approve quote</button>}
    </main>
  );
}

function PublicInvoice({ token }) {
  const [d, , err] = useLoad(() => api(`/public/invoice/${token}`), [token]);
  if (err) return <main><p className="msg">{err}</p></main>;
  if (!d) return <main><p>Loading...</p></main>;
  const inv = d.invoice;
  const pay = async () => { try { location.href = (await api(`/public/invoice/${token}/pay`, {})).url; } catch (e) { alert(e.message); } };
  return (
    <main className="public">
      <h1>{d.shop.name}</h1>
      <p>Invoice #{inv.id} for {d.job.customer_name}<br /><span className="muted">Due {String(inv.due_date).slice(0, 10)}</span></p>
      <Totals doc={inv} />
      {inv.paid_at ? <p className="ok big-text">Paid by {cap(inv.paid_method)}. Thank you!</p>
        : d.payments ? <button className="big green" onClick={pay}>Pay {fmt(inv.total)} by card</button>
        : <p className="muted">Please pay by check, cash, or Venmo. Contact {d.shop.name} with any questions.</p>}
    </main>
  );
}
