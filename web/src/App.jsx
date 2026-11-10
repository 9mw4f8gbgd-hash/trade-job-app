import React, { useEffect, useState, useCallback } from 'react';
import { api, auth, saveVisit, queued, fmt, uid } from './api.js';
import { localKey, startOfDay, addDays, addMonths, weekDays, monthGrid, sameDay, inMonth } from './dates.js';
import { filterJobs } from './jobs.js';

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
  return <Authed path={path} />;
}

const TRADES = [['plumbing', 'Plumbing'], ['well', 'Well services'], ['both', 'Both']];
function TradePrompt({ onDone }) {
  const [err, setErr] = useState('');
  const pick = async (trade) => {
    try { await api('/trade', { trade }, 'PUT'); onDone(); } catch (e) { setErr(e.message); }
  };
  return (
    <main className="login">
      <h1>What work do you do?</h1>
      <p className="muted">This chooses which parts and labor show on a site visit. You can change it later in Settings.</p>
      {TRADES.map(([value, label]) => <button key={value} type="button" className="big" onClick={() => pick(value)}>{label}</button>)}
      {err && <p className="msg">{err}</p>}
    </main>
  );
}

function Authed({ path }) {
  const [me, reload, err] = useLoad(() => api('/me'), []);
  if (err) return <main><p className="msg">{err}</p></main>;
  if (!me) return <main><p>Loading...</p></main>;
  if (!me.shop.trade) return <TradePrompt onDone={reload} />;
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
  const [filter, setFilter] = useState('active');
  const list = filterJobs(jobs, filter);
  const empty = filter === 'completed' ? 'No completed jobs.' : filter === 'all' ? 'No jobs yet. Tap New job to add one.' : 'No active jobs. Tap New job to add one.';
  return (
    <>
      <header><h1>Jobs</h1><button className="add" onClick={() => go('/new')}>+ New job</button></header>
      <div className="seg">{[['active', 'Active'], ['completed', 'Completed'], ['all', 'All']].map(([f, label]) => <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{label}</button>)}</div>
      {!jobs && <p>Loading...</p>}
      {list.map((j) => <JobRow key={j.id} j={j} />)}
      {jobs && !list.length && <p className="muted">{empty}</p>}
    </>
  );
}
const JobRow = ({ j }) => (
  <a className="card row" href={`#/job/${j.id}`}>
    <div><b>{j.customer_name}</b><div className="muted">{j.address}</div>{j.scheduled_at && <div className="muted">{new Date(j.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>}</div>
    <div className="right">
      <span className={'pill ' + j.status}>{cap(j.status)}</span>
      {j.completed_at && <span className="pill">Completed</span>}
    </div>
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
          <div className="btns">
            <button type="button" onClick={() => setEdit(true)}>Edit job</button>
            {job.completed_at
              ? <button type="button" disabled={!!busy} onClick={() => act('reopen', () => api(`/jobs/${id}/reopen`, {}))}>Reopen job</button>
              : <button type="button" disabled={!!busy} onClick={() => { if (confirm('Mark this job complete? It leaves the active list. You can reopen it. Invoices and payments stay as they are.')) act('complete', () => api(`/jobs/${id}/complete`, {})); }}>Complete job</button>}
          </div>
          {job.completed_at && <p className="muted">Completed {new Date(job.completed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. It is off the active list. Invoices and balances are unchanged.</p>}
        </section>
      )}

      <section className="card">
        <h2>Site visits</h2>
        {visits.map((v) => (
          <div key={v.id} className="sub">
            <div className="muted">{new Date(v.created_at).toLocaleString()}</div>
            {v.items.map((i, n) => <div key={n}>{i.qty} x {i.name} at {fmt(i.price)}</div>)}
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
        {doc.items.map((i, n) => <tr key={n}><td>{i.qty} x {i.name}<div className="muted">{fmt(i.price)} each</div></td><td>{fmt(i.price * i.qty)}</td></tr>)}
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
  const [parts, setParts] = useState(cachedParts());
  useEffect(() => { api('/parts').then((p) => { localStorage.setItem('parts', JSON.stringify(p)); setParts(p); }).catch(() => {}); }, []);
  const upd = (k, patch) => setItems(items.map((i, n) => (n === k ? { ...i, ...patch } : i)));
  const add = () => { const p = parts.find((p) => p.name === extra); if (p) setItems([...items, { name: p.name, price: p.price, qty: 1, used: true }]); setExtra(''); };
  const save = async () => { await api(`/jobs/${id}/used`, { items, labor_hours: labor }, 'PUT'); onSaved(); };
  return (
    <section className="card">
      <h2>Parts used</h2>
      <p className="muted">Check off what you actually used.</p>
      {items.map((i, k) => (
        <div key={k} className="check">
          <label><input type="checkbox" checked={i.used} onChange={(e) => upd(k, { used: e.target.checked })} /> {i.name} <span className="muted">{fmt(i.price)}</span></label>
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
  const [custom, setCustom] = useState({ name: '', qty: '1', price: '' });
  const [trade, setTrade] = useState('');
  const [partsReady, setPartsReady] = useState(false);
  useEffect(() => {
    api('/parts').then((p) => { localStorage.setItem('parts', JSON.stringify(p)); setParts(p); setPartsReady(true); }).catch(() => {});
    api('/me').then((m) => setTrade(m.shop.trade || '')).catch(() => {});
  }, []);
  const bump = (p, n) => setCart((c) => {
    const prev = c[p.name];
    const q = Math.max(0, Number(prev?.qty || 0) + n);
    if (!q) { const next = { ...c }; delete next[p.name]; return next; }
    return { ...c, [p.name]: { name: p.name, price: prev ? prev.price : p.price, qty: q } };
  });
  const setQty = (name, qty) => setCart((c) => {
    if (!c[name]) return c;
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) { const next = { ...c }; delete next[name]; return next; }
    return { ...c, [name]: { ...c[name], qty: q } };
  });
  const setPrice = (name, price) => setCart((c) => (c[name] ? { ...c, [name]: { ...c[name], price } } : c));
  const addCustom = () => {
    const name = custom.name.trim();
    const qty = Number(custom.qty);
    const price = Number(custom.price);
    if (!name) return alert('Enter an item name');
    if (!Number.isFinite(qty) || qty <= 0) return alert('Quantity must be greater than 0');
    if (custom.price === '' || !Number.isFinite(price) || price < 0) return alert('Enter a unit price of zero or more');
    setCart((c) => ({ ...c, [name]: { name, price, qty: (Number(c[name]?.qty) || 0) + qty } }));
    setCustom({ name: '', qty: '1', price: '' });
  };
  const addPhoto = (e) => [...e.target.files].forEach((f) => shrink(f).then((d) => setPhotos((p) => [...p, d])));
  const save = async () => {
    const items = Object.values(cart).map((i) => ({ name: String(i.name).trim(), price: Number(i.price), qty: Number(i.qty) })).filter((i) => i.qty > 0);
    if (items.some((i) => !i.name || !Number.isFinite(i.price) || i.price < 0)) return alert('Each item needs a name and a unit price of zero or more.');
    await saveVisit({ client_id: uid(), job_id: Number(jobId), labor_hours: Number(labor), notes, photos, items });
    go(`/job/${jobId}`);
  };
  const shown = parts.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const lines = Object.values(cart);
  const extras = lines.filter((i) => !parts.some((p) => p.name === i.name));
  const editor = (i, cat) => (
    <div key={i.name} className="item-edit">
      <b>{i.name}</b>
      {cat && Number(cat.price) !== Number(i.price) && <div className="muted">Catalog {fmt(cat.price)}</div>}
      <div className="check">
        <div className="qty"><button type="button" onClick={() => setQty(i.name, Number(i.qty) - 1)}>-</button><b>{i.qty}</b><button type="button" onClick={() => setQty(i.name, Number(i.qty) + 1)}>+</button></div>
        <label>Unit price<input aria-label={`Unit price for ${i.name}`} type="number" inputMode="decimal" min="0" step="0.01" value={i.price} onChange={(e) => setPrice(i.name, e.target.value)} /></label>
      </div>
    </div>
  );
  return (
    <>
      <header><a href={`#/job/${jobId}`} className="back">Back</a><h1>Site visit</h1></header>
      <input placeholder="Search parts" value={search} onChange={(e) => setSearch(e.target.value)} />
      {trade === 'plumbing' && <p className="muted">Plumbing parts</p>}
      {trade === 'well' && <p className="muted">Well services parts</p>}
      {trade === 'both' && <p className="muted">Plumbing and well parts</p>}
      {!parts.length && <p className="muted">{partsReady ? 'No parts for this trade. Add an item below, or change trade in Settings.' : 'Parts list not loaded yet. Open this once while online.'}</p>}
      <div className="parts">
        {shown.map((p) => (
          <div key={p.id} className={'part' + (cart[p.name] ? ' on' : '')}>
            <button type="button" className="pname" onClick={() => bump(p, 1)}>{p.name}<small>{fmt(cart[p.name] ? cart[p.name].price : p.price)}</small></button>
            {cart[p.name] && (
              <>
                <div className="qty"><button type="button" onClick={() => bump(p, -1)}>-</button><b>{cart[p.name].qty}</b><button type="button" onClick={() => bump(p, 1)}>+</button></div>
                <label className="tile-price">Unit price<input aria-label={`Unit price for ${p.name}`} type="number" inputMode="decimal" min="0" step="0.01" value={cart[p.name].price} onChange={(e) => setPrice(p.name, e.target.value)} /></label>
                {Number(cart[p.name].price) !== Number(p.price) && <div className="muted tile-note">Catalog {fmt(p.price)}</div>}
              </>
            )}
          </div>
        ))}
      </div>
      <section className="card">
        {!!extras.length && <h2>Custom items</h2>}
        {extras.map((i) => editor(i))}
        <div className="sub">
          <b>Add item</b>
          <p className="muted">For something that is not in the parts list.</p>
          <label>Name<input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Not in the parts list" /></label>
          <label>Quantity<input type="number" inputMode="decimal" min="0" step="any" value={custom.qty} onChange={(e) => setCustom({ ...custom, qty: e.target.value })} /></label>
          <label>Unit price<input aria-label="Custom item unit price" type="number" inputMode="decimal" min="0" step="0.01" value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} placeholder="0.00" /></label>
          <button type="button" onClick={addCustom}>Add item</button>
        </div>
        <label>Labor hours<input type="number" inputMode="decimal" step="0.25" value={labor} onChange={(e) => setLabor(e.target.value)} /></label>
        <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you find?" /></label>
        <label className="btn">Add photo<input type="file" accept="image/*" capture="environment" multiple hidden onChange={addPhoto} /></label>
        <div className="photos">{photos.map((p, k) => <img key={k} src={p} alt="" />)}</div>
        <button type="button" className="big green" onClick={save}>Save visit ({lines.length} items)</button>
      </section>
    </>
  );
}
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.readAsDataURL(file);
  });
}
function sniffImageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const head = String.fromCharCode(...bytes.slice(0, 12));
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return '';
}
async function fileToLogo(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is too large');
  if (file.type && !LOGO_TYPES.includes(file.type)) throw new Error('Use a PNG, JPEG, GIF, or WebP image');
  if (file.size > 512 * 1024) return shrink(file);
  const dataUrl = await readFile(file);
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(String(dataUrl))) return dataUrl;
  const encoded = String(dataUrl).split(',')[1] || '';
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const type = sniffImageType(bytes);
  if (!type) throw new Error('Use a PNG, JPEG, GIF, or WebP image');
  return `data:${type};base64,${encoded}`;
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

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
function jobsOnDay(jobs, day) {
  return (jobs || []).filter((j) => j.scheduled_at && localKey(j.scheduled_at) === localKey(day)).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
}
function MonthGrid({ anchor, jobs, onPick }) {
  const cells = monthGrid(anchor);
  const counts = {};
  for (const j of jobs || []) {
    if (!j.scheduled_at) continue;
    const k = localKey(j.scheduled_at);
    counts[k] = (counts[k] || 0) + 1;
  }
  const today = new Date();
  return (
    <div className="cal">
      {DOW.map((d, i) => <div key={d + i} className="dow">{d}</div>)}
      {cells.map((c) => {
        const n = counts[localKey(c)] || 0;
        const cls = [sameDay(c, anchor) ? 'on' : '', sameDay(c, today) ? 'today' : '', inMonth(c, anchor) ? '' : 'out'].filter(Boolean).join(' ');
        const label = `${c.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}${n ? `, ${n} job${n === 1 ? '' : 's'}` : ', nothing scheduled'}`;
        return (
          <button type="button" key={localKey(c)} className={cls} aria-label={label} onClick={() => onPick(startOfDay(c))}>
            <span>{c.getDate()}</span>
            <span className="dot">{n || ''}</span>
          </button>
        );
      })}
    </div>
  );
}
function Schedule() {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState(() => {
    const saved = sessionStorage.getItem('schedView');
    return saved === 'week' || saved === 'month' ? saved : 'day';
  });
  const [jobs] = useLoad(() => api('/jobs'), []);
  const changeView = (next) => { setView(next); sessionStorage.setItem('schedView', next); };
  const shift = (n) => setDay((d) => (view === 'month' ? addMonths(d, n) : addDays(d, n * (view === 'week' ? 7 : 1))));
  const week = weekDays(day);
  const title = view === 'month'
    ? day.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : view === 'week'
      ? `${week[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${week[6].toLocaleDateString([], { month: 'short', day: 'numeric' })}`
      : day.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const dayList = jobsOnDay(jobs, day);
  return (
    <>
      <header><h1>Schedule</h1><button className="add" onClick={() => go('/new')}>+ New job</button></header>
      <div className="seg">{[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([k, label]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => changeView(k)}>{label}</button>)}</div>
      <div className="seg"><button type="button" onClick={() => shift(-1)}>Prev</button><button type="button" onClick={() => setDay(startOfDay(new Date()))}>Today</button><button type="button" onClick={() => shift(1)}>Next</button></div>
      <h2>{title}</h2>
      {!jobs && <p>Loading...</p>}
      {view === 'month' && <MonthGrid anchor={day} jobs={jobs} onPick={setDay} />}
      {view === 'week' && week.map((d) => (
        <section key={localKey(d)} className="week-day">
          <h2 className={sameDay(d, new Date()) ? 'today-label' : ''}>{d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}{sameDay(d, new Date()) ? ' · Today' : ''}</h2>
          {jobsOnDay(jobs, d).map((j) => <JobRow key={j.id} j={j} />)}
          {jobs && !jobsOnDay(jobs, d).length && <p className="muted">Nothing scheduled</p>}
        </section>
      ))}
      {view !== 'week' && (
        <>
          {view === 'month' && <h2>{day.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</h2>}
          {dayList.map((j) => <JobRow key={j.id} j={j} />)}
          {jobs && !dayList.length && <p className="muted">Nothing scheduled this day.</p>}
        </>
      )}
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
  const save = async () => { await api('/settings', { name: s.name, hourly_rate: s.hourly_rate, tax_rate: s.tax_rate }, 'PUT'); reload(); alert('Saved'); };
  const onLogo = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { setS(await api('/logo', { logo: await fileToLogo(file) }, 'PUT')); } catch (err) { alert(err.message); }
  };
  const removeLogo = async () => {
    if (!confirm('Remove the shop logo?')) return;
    try { setS(await api('/logo', { logo: null }, 'PUT')); } catch (err) { alert(err.message); }
  };
  const addUser = async (e) => { e.preventDefault(); try { await api('/users', nu); setNu({ email: '', name: '', password: '' }); reloadUsers(); } catch (e) { alert(e.message); } };
  return (
    <>
      <header><h1>Settings</h1></header>
      <section className="card">
        <h2>Trade</h2>
        <p className="muted">Which parts and labor show on a site visit.</p>
        {TRADES.map(([value, label]) => (
          <button key={value} type="button" className={'choice' + (s.trade === value ? ' on' : '')} onClick={async () => { try { setS(await api('/trade', { trade: value }, 'PUT')); } catch (e) { alert(e.message); } }}>{label}</button>
        ))}
      </section>
      <section className="card">
        <label>Shop name<input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></label>
        <label>Hourly labor rate ($)<input type="number" inputMode="decimal" value={s.hourly_rate} onChange={(e) => setS({ ...s, hourly_rate: e.target.value })} /></label>
        <label>Tax rate (%)<input type="number" inputMode="decimal" step="0.01" value={s.tax_rate} onChange={(e) => setS({ ...s, tax_rate: e.target.value })} /></label>
        <button className="big" onClick={save}>Save settings</button>
      </section>
      <section className="card">
        <h2>Logo</h2>
        <p className="muted">Optional. Shows on quotes and invoices you give the customer.</p>
        {s.logo ? <img className="logo" src={s.logo} alt="Shop logo preview" /> : <p className="muted">No logo. Customers see your shop name only.</p>}
        <label className="btn">{s.logo ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={onLogo} /></label>
        {s.logo && <button type="button" onClick={removeLogo}>Remove logo</button>}
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

function ShopHead({ shop }) {
  return (
    <div className="shop-head">
      {shop.logo ? <img className="logo" src={shop.logo} alt="" /> : null}
      <h1>{shop.name}</h1>
    </div>
  );
}
function PublicQuote({ token }) {
  const [d, reload, err] = useLoad(() => api(`/public/quote/${token}`), [token]);
  if (err) return <main><p className="msg">{err}</p></main>;
  if (!d) return <main><p>Loading...</p></main>;
  return (
    <main className="public">
      <ShopHead shop={d.shop} />
      <button type="button" className="no-print" onClick={() => window.print()}>Print</button>
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
      <ShopHead shop={d.shop} />
      <button type="button" className="no-print" onClick={() => window.print()}>Print</button>
      <p>Invoice #{inv.id} for {d.job.customer_name}<br /><span className="muted">Due {String(inv.due_date).slice(0, 10)}</span></p>
      <Totals doc={inv} />
      {inv.paid_at ? <p className="ok big-text">Paid by {cap(inv.paid_method)}. Thank you!</p>
        : d.payments ? <button className="big green" onClick={pay}>Pay {fmt(inv.total)} by card</button>
        : <p className="muted">Please pay by check, cash, or Venmo. Contact {d.shop.name} with any questions.</p>}
    </main>
  );
}
