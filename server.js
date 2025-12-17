require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const Razorpay = require('razorpay');
const { z } = require('zod');
const { OAuth2Client } = require('google-auth-library');

const { PrismaClient } = require('@prisma/client');
const { PrismaSessionStore } = require('@quixo3/prisma-session-store');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

if (!process.env.DATABASE_URL) {
  console.error('[config] DATABASE_URL is required. Copy `.env.example` to `.env`.');
  process.exit(1);
}

const prisma = new PrismaClient();

const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret';
if (!process.env.SESSION_SECRET) {
  console.warn('[config] SESSION_SECRET not set. Using an insecure dev default.');
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/auth/google/callback`;

const googleOAuthClient =
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
    ? new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL)
    : null;

const adminEmails = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
);

const isAdminEmail = (email) => adminEmails.has(String(email || '').trim().toLowerCase());

const sanitizeNextPath = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('/')) return '';
  if (raw.startsWith('//')) return '';
  if (raw.includes('\\')) return '';
  if (raw.includes('://')) return '';
  return raw;
};

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false
});

const safeEqualHex = (aHex, bHex) => {
  try {
    const a = Buffer.from(String(aHex || ''), 'hex');
    const b = Buffer.from(String(bHex || ''), 'hex');
    if (a.length === 0 || b.length === 0) return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

const asyncHandler =
  (fn) =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const hmacHex = (secret, value) => crypto.createHmac('sha256', secret).update(String(value)).digest('hex');

const getRazorpayClient = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const getCallbackUrl = () =>
  process.env.RAZORPAY_CALLBACK_URL || `http://localhost:${PORT}/invoice.html`;

const getPaymentProvider = () => {
  const configured = String(process.env.PAYMENT_PROVIDER || '')
    .trim()
    .toLowerCase();
  if (configured) return configured;

  const hasRazorpayKeys = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  if (process.env.NODE_ENV === 'production') return 'razorpay';
  return hasRazorpayKeys ? 'razorpay' : 'fake';
};

const isFakePaymentsEnabled = () => getPaymentProvider() === 'fake' && process.env.NODE_ENV !== 'production';

const requireAuth = asyncHandler(async (req, res, next) => {
  const sessionUser = req.session?.user;
  if (!sessionUser?.id) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user || user.disabledAt) {
    req.session?.destroy(() => {});
    return res.status(403).json({ success: false, message: 'Account disabled' });
  }

  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  return next();
});

const requireRole = (role) => [
  requireAuth,
  (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    if (user.role !== role) return res.status(403).json({ success: false, message: 'Forbidden' });
    return next();
  }
];

const requireAdminPage = asyncHandler(async (req, res, next) => {
  const sessionUser = req.session?.user;
  if (!sessionUser?.id) return res.redirect('/admin-login.html');

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user || user.disabledAt || user.role !== 'ADMIN') {
    req.session?.destroy(() => {});
    return res.redirect('/admin-login.html');
  }

  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  return next();
});

const requireUserPage = asyncHandler(async (req, res, next) => {
  const nextPath = sanitizeNextPath(req.originalUrl) || '/plants.html';
  const sessionUser = req.session?.user;
  if (!sessionUser?.id) {
    if (!googleOAuthClient) {
      return res
        .status(503)
        .send('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }
    return res.redirect(`/auth/google?next=${encodeURIComponent(nextPath)}`);
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user || user.disabledAt) {
    req.session?.destroy(() => {});
    if (!googleOAuthClient) {
      return res
        .status(503)
        .send('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }
    return res.redirect(`/auth/google?next=${encodeURIComponent(nextPath)}`);
  }

  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  return next();
});

const requireSellerPage = asyncHandler(async (req, res, next) => {
  const nextPath = sanitizeNextPath(req.originalUrl) || '/seller-dashboard.html';
  const sessionUser = req.session?.user;
  if (!sessionUser?.id) {
    if (!googleOAuthClient) {
      return res
        .status(503)
        .send('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }
    return res.redirect(`/auth/google?next=${encodeURIComponent(nextPath)}`);
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user || user.disabledAt) {
    req.session?.destroy(() => {});
    if (!googleOAuthClient) {
      return res
        .status(503)
        .send('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }
    return res.redirect(`/auth/google?next=${encodeURIComponent(nextPath)}`);
  }

  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };

  if (user.role === 'ADMIN') return res.redirect('/admin-dashboard.html');
  if (user.role !== 'SELLER') return res.redirect('/seller.html');

  return next();
});

const isValidImageMime = (mimetype) =>
  ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(mimetype || ''));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const original = path.basename(file.originalname || 'file');
    const safeOriginal = original.replace(/[^a-zA-Z0-9._-]/g, '_');
    const suffix = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}-${suffix}-${safeOriginal}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!isValidImageMime(file.mimetype)) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  }
});

// Razorpay webhook must read the raw body for signature verification.
app.post(
  '/payment-webhook',
  express.raw({ type: '*/*' }),
  asyncHandler(async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(503).send('Webhook secret not configured');

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) return res.status(400).send('Missing signature');

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!safeEqualHex(expected, signature)) return res.status(400).send('Invalid signature');

    const event = JSON.parse(rawBody.toString('utf8'));
    if (event?.event !== 'payment_link.paid') return res.status(200).send('Ignored event');

    const paymentLinkId =
      event?.payload?.payment?.entity?.payment_link_id ||
      event?.payload?.payment_link?.entity?.id;
    if (!paymentLinkId) return res.status(400).send('Missing payment link id');

    const order = await prisma.order.findUnique({
      where: { razorpayPaymentLinkId: String(paymentLinkId) },
      include: { items: true }
    });
    if (!order) return res.status(404).send('Order not found');
    if (order.inventoryAppliedAt && !order.inventoryRevertedAt) {
      return res.status(200).send('Already confirmed');
    }

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.order.findUnique({
          where: { id: order.id },
          include: { items: true }
        });
        if (!fresh) throw new Error('Order not found');
        if (fresh.inventoryAppliedAt && !fresh.inventoryRevertedAt) return;

        const plantIds = fresh.items.map((i) => i.plantId);
        const plants = await tx.plant.findMany({ where: { id: { in: plantIds } } });
        const plantById = new Map(plants.map((p) => [p.id, p]));

        for (const item of fresh.items) {
          const plant = plantById.get(item.plantId);
          if (!plant) throw new Error('Plant not found');
          if (plant.stock < item.quantity) {
            await tx.order.update({
              where: { id: fresh.id },
              data: { status: 'CANCELLED' }
            });
            return;
          }
        }

        for (const item of fresh.items) {
          await tx.plant.update({
            where: { id: item.plantId },
            data: {
              stock: { decrement: item.quantity },
              sold: { increment: item.quantity }
            }
          });
        }

        await tx.order.update({
          where: { id: fresh.id },
          data: { status: 'PAID', inventoryAppliedAt: new Date(), inventoryRevertedAt: null }
        });
      });
    } catch (err) {
      console.error('[webhook] error:', err?.message || err);
      return res.status(200).send('Processed');
    }

    return res.status(200).send('Order confirmed');
  })
);

app.use(express.json());
app.use(
  session({
    name: 'sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    },
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 2 * 60 * 1000,
      dbRecordIdIsSessionId: true
    })
  })
);

const publicDir = path.join(__dirname, 'public');

app.get(
  '/',
  asyncHandler(async (req, res) => {
    const sessionUser = req.session?.user;
    if (!sessionUser?.id) return res.sendFile(path.join(publicDir, 'index.html'));

    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || user.disabledAt) {
      req.session?.destroy(() => {});
      return res.sendFile(path.join(publicDir, 'index.html'));
    }

    req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    if (user.role === 'ADMIN') return res.redirect('/admin-dashboard.html');

    return res.sendFile(path.join(publicDir, 'index.html'));
  })
);

app.get('/admin-dashboard.html', requireAdminPage, (req, res) => {
  res.sendFile(path.join(publicDir, 'admin-dashboard.html'));
});

app.get('/plants.html', requireUserPage, (req, res) => res.sendFile(path.join(publicDir, 'plants.html')));
app.get('/plant-detail.html', requireUserPage, (req, res) => res.sendFile(path.join(publicDir, 'plant-detail.html')));
app.get('/cart.html', requireUserPage, (req, res) => res.sendFile(path.join(publicDir, 'cart.html')));
app.get('/order.html', requireUserPage, (req, res) => res.sendFile(path.join(publicDir, 'order.html')));
app.get('/invoice.html', requireUserPage, (req, res) => res.sendFile(path.join(publicDir, 'invoice.html')));
app.get('/fake-pay.html', requireUserPage, (req, res) => res.sendFile(path.join(publicDir, 'fake-pay.html')));
app.get(
  '/seller-dashboard.html',
  requireSellerPage,
  (req, res) => res.sendFile(path.join(publicDir, 'seller-dashboard.html'))
);
app.get('/upload-plant.html', requireSellerPage, (req, res) => res.sendFile(path.join(publicDir, 'upload-plant.html')));

app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));

app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

app.get(
  '/api/me',
  asyncHandler(async (req, res) => {
    const sessionUser = req.session?.user;
    if (!sessionUser?.id) return res.json({ user: null });

    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || user.disabledAt) {
      req.session?.destroy(() => {});
      return res.json({ user: null });
    }

    req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    return res.json({ user: req.session.user });
  })
);

app.post('/logout', asyncHandler(async (req, res) => {
  req.session?.destroy(() => {});
  res.json({ success: true });
}));

app.get(
  '/auth/google',
  asyncHandler(async (req, res) => {
    if (!googleOAuthClient) {
      return res.status(503).send('Google OAuth not configured');
    }

    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    req.session.oauthNext = sanitizeNextPath(req.query?.next) || null;

    const url = googleOAuthClient.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account'
    });

    res.redirect(url);
  })
);

app.get(
  '/auth/google/callback',
  asyncHandler(async (req, res) => {
    if (!googleOAuthClient) {
      return res.status(503).send('Google OAuth not configured');
    }

    const error = String(req.query?.error || '').trim();
    if (error) return res.status(400).send(`Google OAuth error: ${error}`);

    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    if (!code) return res.status(400).send('Missing code');
    if (!state || state !== req.session.oauthState) return res.status(400).send('Invalid state');
    req.session.oauthState = null;
    const nextPath = sanitizeNextPath(req.session.oauthNext);
    req.session.oauthNext = null;

    const { tokens } = await googleOAuthClient.getToken(code);
    if (!tokens?.id_token) return res.status(400).send('Missing id_token');

    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload) return res.status(400).send('Invalid token');

    const googleId = String(payload.sub || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const name = String(payload.name || payload.given_name || '').trim() || email.split('@')[0];
    const emailVerified = Boolean(payload.email_verified);
    const shouldBeAdmin = isAdminEmail(email);

    if (!googleId || !email || !email.includes('@')) {
      return res.status(400).send('Invalid Google profile');
    }
    if (!emailVerified) {
      return res.status(400).send('Google email is not verified');
    }

    let user = await prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
      if (user && user.googleId && user.googleId !== googleId) {
        return res.status(409).send('This email is already linked to another Google account');
      }
    }

    if (user) {
      if (user.disabledAt) {
        req.session?.destroy(() => {});
        return res.status(403).send('Account disabled');
      }

      const updateData = {};
      if (user.googleId !== googleId) updateData.googleId = googleId;
      if (user.name !== name) updateData.name = name;
      if (shouldBeAdmin && user.role !== 'ADMIN') updateData.role = 'ADMIN';

      if (Object.keys(updateData).length) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name,
          role: shouldBeAdmin ? 'ADMIN' : 'CUSTOMER',
          googleId,
          passwordHash: null
        }
      });
    }

    req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };

    const isAdminPath = nextPath?.startsWith('/admin');
    const isSellerPath =
      nextPath === '/seller.html' || nextPath === '/seller-dashboard.html' || nextPath === '/upload-plant.html';

    if (user.role === 'ADMIN') {
      return res.redirect(isAdminPath ? nextPath : '/admin-dashboard.html');
    }

    if (isAdminPath) {
      return res.redirect(user.role === 'SELLER' ? '/seller-dashboard.html' : '/plants.html');
    }

    if (user.role === 'CUSTOMER' && isSellerPath) {
      return res.redirect('/plants.html');
    }

    return res.redirect(nextPath || '/plants.html');
  })
);

const adminUserUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length ? v : null)),
    role: z.enum(['CUSTOMER', 'SELLER', 'ADMIN']).optional()
  })
  .strict();

const adminDisableSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v && v.length ? v : null))
  })
  .strict();

const adminPlantUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    size: z.string().trim().min(1).optional(),
    care: z.string().trim().min(1).optional(),
    price: z.coerce.number().int().nonnegative().optional(),
    stock: z.coerce.number().int().nonnegative().optional(),
    imagePath: z.string().trim().min(1).optional()
  })
  .strict();

const adminOrderStatusSchema = z
  .object({
    status: z.enum(['PENDING', 'PAID', 'CANCELLED', 'FULFILLED'])
  })
  .strict();

app.get(
  '/api/admin/summary',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const [usersTotal, usersDisabled, usersByRole, plantsActive, plantsDeleted, ordersByStatus] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { disabledAt: { not: null } } }),
        prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
        prisma.plant.count({ where: { deletedAt: null } }),
        prisma.plant.count({ where: { deletedAt: { not: null } } }),
        prisma.order.groupBy({ by: ['status'], _count: { _all: true } })
      ]);

    res.json({
      users: {
        total: usersTotal,
        disabled: usersDisabled,
        byRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all]))
      },
      plants: {
        active: plantsActive,
        deleted: plantsDeleted
      },
      orders: {
        byStatus: Object.fromEntries(ordersByStatus.map((r) => [r.status, r._count._all]))
      }
    });
  })
);

app.get(
  '/api/admin/users',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        photoPath: true,
        disabledAt: true,
        disabledReason: true,
        createdAt: true,
        updatedAt: true
      }
    });
    res.json(users);
  })
);

app.put(
  '/api/admin/users/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false });

    const parsed = adminUserUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid payload' });

    if (id === req.session.user.id && parsed.data.role && parsed.data.role !== 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Cannot change your own admin role' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        photoPath: true,
        disabledAt: true,
        disabledReason: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({ success: true, user: updated });
  })
);

app.put(
  '/api/admin/users/:id/disable',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false });
    if (id === req.session.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot disable your own account' });
    }

    const parsed = adminDisableSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false });

    const updated = await prisma.user.update({
      where: { id },
      data: { disabledAt: new Date(), disabledReason: parsed.data.reason },
      select: { id: true, email: true, name: true, role: true, disabledAt: true, disabledReason: true }
    });

    res.json({ success: true, user: updated });
  })
);

app.put(
  '/api/admin/users/:id/enable',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false });

    const updated = await prisma.user.update({
      where: { id },
      data: { disabledAt: null, disabledReason: null },
      select: { id: true, email: true, name: true, role: true, disabledAt: true, disabledReason: true }
    });

    res.json({ success: true, user: updated });
  })
);

app.get(
  '/api/admin/plants',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const plants = await prisma.plant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { seller: { select: { id: true, email: true } } }
    });
    res.json(
      plants.map((p) => ({
        id: p.id,
        name: p.name,
        size: p.size,
        care: p.care,
        price: p.price,
        stock: p.stock,
        sold: p.sold,
        imagePath: p.imagePath,
        sellerId: p.sellerId,
        sellerEmail: p.seller?.email,
        deletedAt: p.deletedAt,
        deletedReason: p.deletedReason,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }))
    );
  })
);

app.put(
  '/api/admin/plants/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false });

    const parsed = adminPlantUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid payload' });

    const updated = await prisma.plant.update({
      where: { id },
      data: parsed.data,
      include: { seller: { select: { id: true, email: true } } }
    });

    res.json({ success: true, plant: updated });
  })
);

app.delete(
  '/api/admin/plants/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false });

    const parsed = adminDisableSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false });

    const updated = await prisma.plant.update({
      where: { id },
      data: { deletedAt: new Date(), deletedReason: parsed.data.reason },
      select: { id: true, deletedAt: true, deletedReason: true }
    });

    res.json({ success: true, plant: updated });
  })
);

app.put(
  '/api/admin/plants/:id/restore',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false });

    const updated = await prisma.plant.update({
      where: { id },
      data: { deletedAt: null, deletedReason: null },
      select: { id: true, deletedAt: true, deletedReason: true }
    });

    res.json({ success: true, plant: updated });
  })
);

app.get(
  '/api/admin/orders',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        user: { select: { id: true, email: true, name: true } }
      }
    });
    res.json(orders);
  })
);

app.put(
  '/api/admin/orders/:id/status',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false });

    const parsed = adminOrderStatusSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid payload' });

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) return { ok: false, code: 404, message: 'Order not found' };

      const nextStatus = parsed.data.status;
      const wantsCancel = nextStatus === 'CANCELLED';
      const wantsApplyInventory = nextStatus === 'PAID' || nextStatus === 'FULFILLED';
      const inventoryApplied = order.inventoryAppliedAt && !order.inventoryRevertedAt;

      if (wantsCancel && inventoryApplied) {
        for (const item of order.items) {
          await tx.plant.update({
            where: { id: item.plantId },
            data: { stock: { increment: item.quantity }, sold: { decrement: item.quantity } }
          });
        }
      }

      if (wantsApplyInventory && !inventoryApplied) {
        const plantIds = order.items.map((i) => i.plantId);
        const plants = await tx.plant.findMany({ where: { id: { in: plantIds } } });
        const plantById = new Map(plants.map((p) => [p.id, p]));

        for (const item of order.items) {
          const plant = plantById.get(item.plantId);
          if (!plant) return { ok: false, code: 400, message: 'Missing plant for order item' };
          if (plant.stock < item.quantity) {
            return { ok: false, code: 400, message: 'Insufficient stock to apply this status' };
          }
        }

        for (const item of order.items) {
          await tx.plant.update({
            where: { id: item.plantId },
            data: { stock: { decrement: item.quantity }, sold: { increment: item.quantity } }
          });
        }
      }

      const nextData = { status: nextStatus };
      if (wantsCancel && inventoryApplied) {
        nextData.inventoryRevertedAt = new Date();
      }
      if (wantsApplyInventory && !inventoryApplied) {
        nextData.inventoryAppliedAt = order.inventoryAppliedAt || new Date();
        nextData.inventoryRevertedAt = null;
      }

      const saved = await tx.order.update({
        where: { id },
        data: nextData
      });

      return { ok: true, order: saved };
    });

    if (!updated.ok) {
      return res.status(updated.code).json({ success: false, message: updated.message });
    }

    res.json({ success: true, order: updated.order });
  })
);

const toPlantResponse = (plant) => ({
  id: plant.id,
  name: plant.name,
  size: plant.size,
  care: plant.care,
  price: plant.price,
  imagePath: plant.imagePath,
  sellerName: plant.seller?.email,
  sold: plant.sold,
  stock: plant.stock
});

app.get(
  '/data/plants.json',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const plants = await prisma.plant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { seller: { select: { email: true } } }
    });
    res.json(plants.map(toPlantResponse));
  })
);

app.get(
  '/plants',
  requireAuth,
  asyncHandler(async (req, res) => {
    const plants = await prisma.plant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { seller: { select: { email: true } } }
    });
    res.json(plants.map(toPlantResponse));
  })
);

app.get(
  '/plants/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const plant = await prisma.plant.findUnique({
      where: { id },
      include: { seller: { select: { email: true } } }
    });
    if (!plant || plant.deletedAt) {
      return res.status(404).json({ success: false, message: 'Plant not found.' });
    }
    res.json(toPlantResponse(plant));
  })
);

const plantCreateSchema = z.object({
  name: z.string().trim().min(1),
  size: z.string().trim().min(1),
  care: z.string().trim().min(1),
  price: z.coerce.number().int().nonnegative(),
  stock: z.coerce.number().int().nonnegative()
});

app.post(
  '/upload-plant',
  requireRole('SELLER'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Image upload failed' });

    const quantityRaw = req.body?.stock ?? req.body?.quantity;
    const parsed = plantCreateSchema.safeParse({ ...req.body, stock: quantityRaw });
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
    }

    const sellerId = req.session.user.id;
    const created = await prisma.plant.create({
      data: {
        name: parsed.data.name,
        size: parsed.data.size,
        care: parsed.data.care,
        price: parsed.data.price,
        stock: parsed.data.stock,
        imagePath: `/uploads/${req.file.filename}`,
        sellerId
      },
      include: { seller: { select: { email: true } } }
    });

    res.json({ success: true, plant: toPlantResponse(created) });
  })
);

app.get(
  '/api/my-plants',
  requireRole('SELLER'),
  asyncHandler(async (req, res) => {
    const plants = await prisma.plant.findMany({
      where: { sellerId: req.session.user.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { seller: { select: { email: true } } }
    });
    res.json(plants.map(toPlantResponse));
  })
);

const plantUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    size: z.string().trim().min(1).optional(),
    care: z.string().trim().min(1).optional(),
    price: z.coerce.number().int().nonnegative().optional(),
    stock: z.coerce.number().int().nonnegative().optional(),
    imagePath: z.string().trim().min(1).optional()
  })
  .strict();

app.put(
  '/api/update-plant/:id',
  requireRole('SELLER'),
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false });

    const parsed = plantUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false });

    const plant = await prisma.plant.findUnique({ where: { id } });
    if (!plant || plant.deletedAt) return res.status(404).json({ success: false });
    if (plant.sellerId !== req.session.user.id) {
      return res.status(403).json({ success: false });
    }

    const updated = await prisma.plant.update({
      where: { id },
      data: parsed.data,
      include: { seller: { select: { email: true } } }
    });

    res.json({ success: true, plant: toPlantResponse(updated) });
  })
);

app.get(
  '/api/my-dashboard',
  requireRole('SELLER'),
  asyncHandler(async (req, res) => {
    const plants = await prisma.plant.findMany({
      where: { sellerId: req.session.user.id, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });

    const dashboard = plants.map((p) => {
      const booked = p.sold > 0 ? p.sold : '--';
      const profit = p.sold > 0 ? (p.price * p.sold * 0.5).toFixed(2) : '--';
      return {
        id: p.id,
        name: p.name,
        size: p.size,
        price: p.price,
        booked,
        profit,
        imagePath: p.imagePath,
        stock: p.stock
      };
    });

    res.json(dashboard);
  })
);

const cartSchema = z.record(z.string(), z.coerce.number().int().positive());

const parseCartEntries = (cart) => {
  const parsed = cartSchema.safeParse(cart);
  if (!parsed.success) return null;
  const entries = [];
  for (const [key, qty] of Object.entries(parsed.data)) {
    const plantId = Number.parseInt(key, 10);
    if (!Number.isFinite(plantId) || qty < 1) return null;
    entries.push({ plantId, quantity: qty });
  }
  if (entries.length === 0) return null;
  return entries;
};

const buildCartForTx = async (tx, entries) => {
  const ids = entries.map((e) => e.plantId);
  const plants = await tx.plant.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: { seller: { select: { email: true } } }
  });
  const byId = new Map(plants.map((p) => [p.id, p]));

  const items = [];
  let total = 0;

  for (const entry of entries) {
    const plant = byId.get(entry.plantId);
    if (!plant) return { ok: false, message: `Plant ${entry.plantId} not found.` };
    if (plant.stock < entry.quantity) {
      return { ok: false, message: `Insufficient stock for ${plant.name}.` };
    }
    const subtotal = plant.price * entry.quantity;
    total += subtotal;
    items.push({
      plantId: plant.id,
      quantity: entry.quantity,
      unitPrice: plant.price,
      subtotal,
      plantName: plant.name,
      imagePath: plant.imagePath
    });
  }

  return { ok: true, items, total };
};

app.post(
  '/buy/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const plantId = Number.parseInt(req.params.id, 10);
    const quantity = Number.parseInt(req.body?.quantity, 10) || 1;
    const address = String(req.body?.address || '').trim();

    if (!Number.isFinite(plantId)) {
      return res.status(400).json({ success: false, message: 'Invalid plant id.' });
    }
    if (!address) return res.status(400).json({ success: false, message: 'Missing address.' });
    if (!Number.isFinite(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Invalid quantity.' });
    }

    const sessionUser = req.session.user;
    const email = sessionUser.email;

    const order = await prisma.$transaction(async (tx) => {
      const plant = await tx.plant.findUnique({ where: { id: plantId } });
      if (!plant || plant.deletedAt) return { ok: false, code: 404, message: 'Plant not found.' };
      if (plant.stock < quantity) return { ok: false, code: 400, message: 'Not enough stock.' };

      await tx.plant.update({
        where: { id: plantId },
        data: { stock: { decrement: quantity }, sold: { increment: quantity } }
      });

      const total = plant.price * quantity;
      const created = await tx.order.create({
        data: {
          email,
          address,
          paymentMethod: 'COD',
          status: 'PENDING',
          total,
          inventoryAppliedAt: new Date(),
          inventoryRevertedAt: null,
          userId: sessionUser.id,
          items: {
            create: [
              {
                plantId: plant.id,
                quantity,
                unitPrice: plant.price,
                subtotal: total,
                plantName: plant.name,
                imagePath: plant.imagePath
              }
            ]
          }
        }
      });

      return { ok: true, created, plant, total };
    });

    if (!order.ok) {
      return res.status(order.code).json({ success: false, message: order.message });
    }

    res.json({
      success: true,
      message: 'Order placed successfully.',
      invoice: {
        plantName: order.plant.name,
        quantity,
        pricePerUnit: order.plant.price,
        total: order.total,
        paymentMethod: 'Cash on Delivery',
        shippingAddress: address
      }
    });
  })
);

app.post(
  '/place-order',
  requireAuth,
  asyncHandler(async (req, res) => {
    const address = String(req.body?.address || '').trim();
    const entries = parseCartEntries(req.body?.cart);
    if (!entries) return res.status(400).json({ success: false, message: 'Invalid cart.' });
    if (!address) return res.status(400).json({ success: false, message: 'Missing address.' });

    const sessionUser = req.session.user;
    const email = sessionUser.email;

    const result = await prisma.$transaction(async (tx) => {
      const prepared = await buildCartForTx(tx, entries);
      if (!prepared.ok) return prepared;

      for (const item of prepared.items) {
        await tx.plant.update({
          where: { id: item.plantId },
          data: { stock: { decrement: item.quantity }, sold: { increment: item.quantity } }
        });
      }

      const order = await tx.order.create({
        data: {
          email,
          address,
          paymentMethod: 'COD',
          status: 'PENDING',
          total: prepared.total,
          inventoryAppliedAt: new Date(),
          inventoryRevertedAt: null,
          userId: sessionUser.id,
          items: { create: prepared.items }
        },
        include: { items: true }
      });

      return { ok: true, order };
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message || 'Order failed.' });
    }

    res.json({ success: true, order: result.order });
  })
);

app.post(
  '/pay-order',
  requireAuth,
  asyncHandler(async (req, res) => {
    const address = String(req.body?.address || '').trim();
    const entries = parseCartEntries(req.body?.cart);
    if (!entries) return res.status(400).json({ success: false, message: 'Invalid cart.' });
    if (!address) return res.status(400).json({ success: false, message: 'Missing address.' });

    const sessionUser = req.session.user;
    const email = sessionUser.email;

    const result = await prisma.$transaction(async (tx) => {
      const prepared = await buildCartForTx(tx, entries);
      if (!prepared.ok) return prepared;

      for (const item of prepared.items) {
        await tx.plant.update({
          where: { id: item.plantId },
          data: { stock: { decrement: item.quantity }, sold: { increment: item.quantity } }
        });
      }

      const order = await tx.order.create({
        data: {
          email,
          address,
          paymentMethod: 'RAZORPAY',
          status: 'PENDING',
          total: prepared.total,
          inventoryAppliedAt: new Date(),
          inventoryRevertedAt: null,
          userId: sessionUser.id,
          items: { create: prepared.items }
        },
        include: { items: true }
      });

      return { ok: true, order };
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message || 'Order failed.' });
    }

    res.json({ success: true, order: result.order });
  })
);

app.post(
  '/create-payment',
  authLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const address = String(req.body?.address || '').trim();
    const entries = parseCartEntries(req.body?.cart);
    if (!entries) return res.status(400).json({ success: false, message: 'Invalid cart.' });
    if (!address) return res.status(400).json({ success: false, message: 'Missing address.' });

    const sessionUser = req.session.user;
    const email = sessionUser.email;

    const prepared = await prisma.$transaction(async (tx) => buildCartForTx(tx, entries));
    if (!prepared.ok) {
      return res.status(400).json({ success: false, message: prepared.message || 'Invalid cart.' });
    }

    const provider = getPaymentProvider();
    if (!['razorpay', 'fake'].includes(provider)) {
      return res.status(500).json({ success: false, message: 'Invalid payment provider config' });
    }

    if (provider === 'fake') {
      if (!isFakePaymentsEnabled()) {
        return res.status(403).json({ success: false, message: 'Fake payments are disabled' });
      }

      const paymentLinkId = `fakepl_${crypto.randomBytes(12).toString('hex')}`;
      const token = hmacHex(SESSION_SECRET, paymentLinkId);

      try {
        await prisma.order.create({
          data: {
            email,
            address,
            paymentMethod: 'RAZORPAY',
            status: 'PENDING',
            total: prepared.total,
            razorpayPaymentLinkId: paymentLinkId,
            userId: sessionUser.id,
            items: { create: prepared.items }
          }
        });
      } catch (err) {
        console.error('[create-payment] failed to persist fake order:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Could not persist pending order' });
      }

      return res.json({
        success: true,
        short_url: `/fake-pay.html?pl=${encodeURIComponent(paymentLinkId)}&token=${encodeURIComponent(
          token
        )}`
      });
    }

    let payment;
    try {
      const razorpay = getRazorpayClient();
      if (!razorpay) {
        return res.status(503).json({
          success: false,
          message: 'Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
        });
      }

      payment = await razorpay.paymentLink.create({
        amount: Math.round(prepared.total * 100),
        currency: 'INR',
        accept_partial: false,
        customer: { name: String(req.body?.name || sessionUser.name || email), email },
        notify: { sms: false, email: true },
        callback_url: getCallbackUrl(),
        callback_method: 'get'
      });
    } catch (err) {
      console.error('[create-payment] error:', err?.message || err);
      return res.status(500).json({ success: false, message: 'Could not create payment link' });
    }

    try {
      await prisma.order.create({
        data: {
          email,
          address,
          paymentMethod: 'RAZORPAY',
          status: 'PENDING',
          total: prepared.total,
          razorpayPaymentLinkId: payment.id,
          userId: sessionUser.id,
          items: { create: prepared.items }
        }
      });
    } catch (err) {
      console.error('[create-payment] failed to persist order:', err?.message || err);
      return res.status(500).json({ success: false, message: 'Could not persist pending order' });
    }

    res.json({ success: true, short_url: payment.short_url });
  })
);

app.post(
  '/api/fake-payment/confirm',
  authLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isFakePaymentsEnabled()) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const schema = z
      .object({
        paymentLinkId: z.string().trim().min(1),
        token: z.string().trim().min(1)
      })
      .strict();

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const { paymentLinkId, token } = parsed.data;
    const expected = hmacHex(SESSION_SECRET, paymentLinkId);
    if (!safeEqualHex(expected, token)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const order = await prisma.order.findUnique({
      where: { razorpayPaymentLinkId: paymentLinkId },
      include: { items: true }
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.order.findUnique({
          where: { id: order.id },
          include: { items: true }
        });
        if (!fresh) throw new Error('Order not found');

        if (fresh.inventoryAppliedAt && !fresh.inventoryRevertedAt) {
          return;
        }

        const plantIds = fresh.items.map((i) => i.plantId);
        const plants = await tx.plant.findMany({ where: { id: { in: plantIds }, deletedAt: null } });
        const plantById = new Map(plants.map((p) => [p.id, p]));

        for (const item of fresh.items) {
          const plant = plantById.get(item.plantId);
          if (!plant) throw new Error('Plant not found');
          if (plant.stock < item.quantity) {
            await tx.order.update({
              where: { id: fresh.id },
              data: { status: 'CANCELLED' }
            });
            return;
          }
        }

        for (const item of fresh.items) {
          await tx.plant.update({
            where: { id: item.plantId },
            data: {
              stock: { decrement: item.quantity },
              sold: { increment: item.quantity }
            }
          });
        }

        await tx.order.update({
          where: { id: fresh.id },
          data: { status: 'PAID', inventoryAppliedAt: new Date(), inventoryRevertedAt: null }
        });
      });
    } catch (err) {
      console.error('[fake-payment] error:', err?.message || err);
      return res.status(500).json({ success: false, message: 'Could not confirm payment' });
    }

    return res.json({ success: true });
  })
);

// Basic error handler (keep JSON for API routes).
app.use((err, req, res, next) => {
  console.error('[error]', err?.message || err);
  if (res.headersSent) return next(err);

  const prismaCode = err && typeof err === 'object' ? err.code : null;
  let status = 500;
  let message = 'Internal server error';

  if (prismaCode === 'P2025') {
    status = 404;
    message = 'Not found';
  } else if (prismaCode === 'P2002') {
    status = 409;
    message = 'Already exists';
  } else if (err?.message === 'Only image uploads are allowed') {
    status = 400;
    message = err.message;
  }

  const wantsJson =
    req.path.startsWith('/api/') ||
    req.path.startsWith('/create-payment') ||
    req.path.startsWith('/place-order') ||
    req.path.startsWith('/pay-order') ||
    req.path.startsWith('/upload-plant') ||
    req.path.startsWith('/buy/');

  if (wantsJson) {
    return res.status(status).json({ success: false, message });
  }
  return res.status(status).send(message);
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const shutdown = async () => {
  server.close(() => {});
  await prisma.$disconnect().catch(() => {});
};

process.on('SIGINT', () => shutdown().finally(() => process.exit(0)));
process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)));
