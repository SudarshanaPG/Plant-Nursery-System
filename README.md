# GreenLeaf Nursery (Resume-Ready)

Small e-commerce style demo with:
- Node.js + Express
- Prisma + SQLite (dev) with migrations
- Cookie-based sessions stored in DB (no JWT)
- Static `public/` HTML/CSS/JS frontend

## Quickstart (Windows / PowerShell)

```powershell
cd "D:\My project"
npm install
Copy-Item .env.example .env
npm run prisma:deploy
npm run prisma:generate
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Copy `.env.example` -> `.env`.

- `DATABASE_URL` (required): SQLite by default (`file:./dev.db`) relative to `prisma/schema.prisma`
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

- Customers: click "Continue with Google" -> browse plants -> add to cart -> checkout (required)
- Sellers: click "Continue with Google" -> (admin promotes to SELLER) -> upload plants -> manage stock in dashboard
- Admin: set `ADMIN_EMAILS`, then click "Continue with Google" on `http://localhost:3000/admin-login.html`

## Payments (dev vs prod)

- Dev: set `PAYMENT_PROVIDER=fake` to use `fake-pay.html` (no ngrok/webhook required)
- Prod: set `PAYMENT_PROVIDER=razorpay` and configure Razorpay keys + webhook to `/payment-webhook`

## Deploy (Render)

1. Push this repo to GitHub.
2. On Render: New -> Web Service -> connect the repo.
3. Add a persistent disk (optional but recommended):
   - Mount path: `/var/data`
4. Set Build Command:
   - `npm ci && npm run prisma:generate`
5. Set Start Command:
   - `npm run prisma:deploy && npm start`

Note: if you use a Render Disk mounted at `/var/data`, it is only available at runtime (not during build). That’s why `prisma migrate deploy` must run in the Start Command, not the Build Command.
6. Set environment variables (Render -> Environment):
   - `NODE_ENV=production`
   - `DATABASE_URL=file:/var/data/prod.db` (or another path if you didn't mount a disk)
   - `UPLOAD_DIR=/var/data/uploads` (optional; matches the disk mount above)
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
