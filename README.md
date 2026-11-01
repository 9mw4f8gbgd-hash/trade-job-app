# Shop Jobs (Phase 1 MVP)

Job management for small plumbing and well pump shops. React (Vite) PWA + Express API + Postgres.

## Run locally
```
npm install
npm run dev        # API on :3001 + web on :5173 (proxied /api)
```
Open http://localhost:5173 and log in as `owner@demo.test` / `demo1234` (also `tech@` and `office@`).
Without `DATABASE_URL` the API uses an in-memory Postgres emulator (pg-mem), auto-seeded, reset on restart.

With real Postgres:
```
export DATABASE_URL=postgres://...
npm run seed       # runs migrations + demo shop, 42 starter parts, 3 jobs
npm run dev
```
Production style: `npm run build && npm start` (API serves `web/dist` on :3001). The service worker only registers in the production build.

## Scripts
`dev`, `build`, `start`, `migrate`, `seed`, `test` (quote/invoice math + one end to end API test).

## Env vars
See `.env.example`: `DATABASE_URL`, `PGSSL`, `PORT`, `PUBLIC_URL`, `STRIPE_SECRET_KEY`, `STRIPE_CURRENCY`, `RESEND_API_KEY`, `RESEND_FROM`, `SEED_ON_START`.

## Features
Jobs list and day schedule; site visit capture (tap parts, qty, labor, photos, notes) that queues offline and syncs (idempotent by client id); quote auto-drafted from visits with share link and customer Approve; parts used checklist with diff vs quote; invoice from parts used with share link; Mark Paid with method (Check, Cash, Venmo, Card, Other) plus check number or note; optional Stripe Checkout; Money dashboard (Unpaid, Viewed, Overdue, Paid). Links are never sent automatically.

## Deploy on Railway (notes only)
One service from this repo (uses `railway.json`: build `npm run build`, start `npm start`) plus the Postgres plugin. Set `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `PUBLIC_URL`, and optionally `STRIPE_SECRET_KEY`. Run `npm run seed` once or set `SEED_ON_START=1` for the first boot. Migrations run on every start.
