# GreenLeaf Nursery (Resume-Ready)

Small e-commerce style demo with:
- Node.js + Express
- Prisma + Postgres (Neon/Supabase recommended)
- Cookie-based sessions stored in DB (no JWT)
- Google OAuth-only login for customer/seller/admin
- Static `public/` HTML/CSS/JS frontend + admin/seller dashboards

## Quickstart (Windows / PowerShell)

```powershell
cd "D:\My project"
npm install
Copy-Item .env.example .env
# Edit .env and set DATABASE_URL to your Postgres connection string
npm run prisma:deploy
npm run prisma:generate
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Copy `.env.example` -> `.env`.

- `DATABASE_URL` (required): Postgres connection string (Neon/Supabase)
- `SESSION_SECRET` (recommended): random long string
- `PAYMENT_PROVIDER`: `fake` (dev demo) or `razorpay` (real)
- Google OAuth (required for login):
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_CALLBACK_URL`
- Admin access:
  - `ADMIN_EMAILS` (comma-separated; grants ADMIN on Google sign-in)
- Razorpay (optional, only needed for online payments + webhook):
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
  - `RAZORPAY_WEBHOOK_SECRET`
  - `RAZORPAY_CALLBACK_URL`

## Useful commands

- Start dev server: `npm run dev`
- Start production server: `npm start`
- Apply migrations (dev): `npm run prisma:migrate`
- Apply migrations (prod-style): `npm run prisma:deploy`
- Prisma Studio: `npm run prisma:studio`

## App flow

- Customers: Continue with Google -> browse -> cart -> checkout (login required)
- Sellers: Continue with Google -> (admin promotes to SELLER) -> upload plants -> manage stock
- Admin: set `ADMIN_EMAILS`, then Continue with Google on `http://localhost:3000/admin-login.html`

## Payments (dev vs prod)

- Dev: set `PAYMENT_PROVIDER=fake` (no webhook/ngrok needed)
- Prod: set `PAYMENT_PROVIDER=razorpay` and configure Razorpay keys + webhook to `/payment-webhook`

## Deploy (Render)

Free tier note: Render free plan does not provide persistent disks, so use a hosted Postgres DB (Neon/Supabase).

1. Create a Postgres database (Neon/Supabase) and copy the connection string.
2. On Render: New -> Web Service -> connect the repo.
3. Build Command: `npm ci && npm run prisma:generate`
4. Start Command: `npm run prisma:deploy && npm start`
5. Environment variables:
   - `NODE_ENV=production`
   - `DATABASE_URL=postgresql://...` (Neon/Supabase connection string)
   - `UPLOAD_DIR=/tmp/uploads` (uploads are ephemeral on free tier)
   - `SESSION_SECRET=...`
   - `GOOGLE_CLIENT_ID=...`
   - `GOOGLE_CLIENT_SECRET=...`
   - `GOOGLE_CALLBACK_URL=https://YOUR_RENDER_DOMAIN/auth/google/callback`
   - `ADMIN_EMAILS=your-admin@gmail.com`
   - Optional payments:
     - `PAYMENT_PROVIDER=fake` (demo) or `PAYMENT_PROVIDER=razorpay`
     - `RAZORPAY_KEY_ID=...`
     - `RAZORPAY_KEY_SECRET=...`
     - `RAZORPAY_WEBHOOK_SECRET=...`
     - `RAZORPAY_CALLBACK_URL=https://YOUR_RENDER_DOMAIN/invoice.html`

Google OAuth config you must update for the hosted domain:

- Authorized JavaScript origins: `https://YOUR_RENDER_DOMAIN`
- Authorized redirect URIs: `https://YOUR_RENDER_DOMAIN/auth/google/callback`

Razorpay webhook URL (hosted only):

- `https://YOUR_RENDER_DOMAIN/payment-webhook`
