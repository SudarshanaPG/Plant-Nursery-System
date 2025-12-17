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
