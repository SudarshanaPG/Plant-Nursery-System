const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

const crypto = require('crypto');
const pendingPath = path.join(__dirname, 'data/pending-orders.json');
const rawBodyParser = express.raw({ type: 'application/json' });

app.post('/payment-webhook', bodyParser.raw({ type: '*/*' }), (req, res) => {
  try {
    const secret = "webhook_secret_123"; // This should match Razorpay's webhook secret
    const signature = req.headers["x-razorpay-signature"];

    // Raw body for hashing
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

    // Verify signature
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      console.error("❌ Signature mismatch");
      return res.status(400).send("Invalid signature");
    }

    // Parse webhook payload
    const event = JSON.parse(rawBody.toString());
    if (event.event !== "payment_link.paid") {
      return res.status(200).send("Ignored event");
    }

    const paymentLinkId = event.payload.payment.entity.payment_link_id;

    const pendingOrders = fs.existsSync(pendingPath)
      ? JSON.parse(fs.readFileSync(pendingPath))
      : [];

    const orderIndex = pendingOrders.findIndex(o => o.razorpayPaymentLinkId === paymentLinkId);
    if (orderIndex === -1) return res.status(404).send("Order not found");

    const matched = pendingOrders[orderIndex];
    const plants = JSON.parse(fs.readFileSync(plantsPath));
    const sales = fs.existsSync(salesPath) ? JSON.parse(fs.readFileSync(salesPath)) : [];

    const items = [];
    let total = 0;
    let ok = true;

    Object.keys(matched.cart).forEach(id => {
      const plant = plants.find(p => p.id == id);
      if (!plant || plant.stock < matched.cart[id]) {
        ok = false;
      } else {
        plant.stock -= matched.cart[id];
        const itemTotal = plant.price * matched.cart[id];
        total += itemTotal;
        items.push({ ...plant, quantity: matched.cart[id], subtotal: itemTotal });
      }
    });

    if (!ok) return res.status(400).send("Stock error");

    const order = {
      id: Date.now(),
      user: matched.user,
      address: matched.address,
      payment: "Online (Razorpay)",
      items,
      total,
      timestamp: new Date().toISOString()
    };

    sales.push(order);
    pendingOrders.splice(orderIndex, 1);

    fs.writeFileSync(plantsPath, JSON.stringify(plants, null, 2));
    fs.writeFileSync(salesPath, JSON.stringify(sales, null, 2));
    fs.writeFileSync(pendingPath, JSON.stringify(pendingOrders, null, 2));

    console.log("✅ Webhook handled successfully");
    res.status(200).send("Order confirmed");
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).send("Webhook processing failed");
  }
});


// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use('/uploads', express.static('uploads'));

// Ensure directories exist
const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// File paths
const plantsFile = 'data/plants.json';
const sellersFile = 'data/sellers.json';
const salesFile = 'data/sales.json';
const plantsPath = path.join(__dirname, 'data', 'plants.json');

let plants = [];
let sellers = [];
let sales = [];

// Load existing data
const loadData = () => {
  if (fs.existsSync(plantsFile)) plants = JSON.parse(fs.readFileSync(plantsFile));
  if (fs.existsSync(sellersFile)) sellers = JSON.parse(fs.readFileSync(sellersFile));
  if (fs.existsSync(salesFile)) sales = JSON.parse(fs.readFileSync(salesFile));
};

const saveData = () => {
  fs.writeFileSync(plantsFile, JSON.stringify(plants, null, 2));
  fs.writeFileSync(sellersFile, JSON.stringify(sellers, null, 2));
  fs.writeFileSync(salesFile, JSON.stringify(sales, null, 2));
};

loadData();

// ------------------------------
// ROUTES
// ------------------------------

// Upload a plant
app.post('/upload-plant', upload.single('image'), (req, res) => {
  try {
    const { name, size, care, price, sellerEmail, stock } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image upload failed' });
    }

    const plants = fs.existsSync(plantsPath)
      ? JSON.parse(fs.readFileSync(plantsPath))
      : [];

    const stockNum = parseInt(stock);

    const newPlant = {
      id: Date.now(),
      name,
      size,
      care,
      price: parseFloat(price),
      imagePath: `/uploads/${req.file.filename}`,
      sellerName: sellerEmail,
      sold: 0,
      stock: stockNum
    };

    plants.push(newPlant);
    fs.writeFileSync(plantsPath, JSON.stringify(plants, null, 2));

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error in /upload-plant:", err);
    res.status(500).json({ success: false, message: "Something went wrong while uploading the plant." });
  }
});



// Get all plants
app.get('/plants', (req, res) => {
  res.json(plants);
});

// Plant detail
app.get('/plants/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const plant = plants.find(p => p.id === id);
  if (plant) {
    res.json(plant);
  } else {
    res.status(404).json({ success: false, message: "Plant not found." });
  }
});

// Purchase a plant
app.post('/buy/:id', bodyParser.json(), (req, res) => {
  const id = parseInt(req.params.id);
  const quantity = parseInt(req.body.quantity) || 1;
  const address = req.body.address || '';
  const paymentMethod = req.body.paymentMethod || '';

  const plant = plants.find(p => p.id === id);
  if (!plant) {
    return res.status(404).json({ success: false, message: "Plant not found." });
  }

  if (plant.stock < quantity) {
    return res.status(400).json({ success: false, message: "Not enough stock." });
  }

  plant.stock -= quantity;
  plant.sold += quantity;

  sales.push({
    plantId: plant.id,
    quantity,
    buyerAddress: address,
    paymentMethod
  });

  saveData();

  res.json({
    success: true,
    message: "Order placed successfully.",
    invoice: {
      plantName: plant.name,
      quantity,
      pricePerUnit: plant.price,
      total: plant.price * quantity,
      paymentMethod,
      shippingAddress: address
    }
  });
});

// Admin dashboard data
app.get('/admin-data', (req, res) => {
  // Include seller photo, phone, etc.
  const sellersWithDetails = sellers.map(s => ({
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    photoPath: s.photoPath
  }));

  res.json({
    sellers: sellersWithDetails,
    plants,
    sales
  });
});

// Seller's own plants
app.get('/api/my-plants', (req, res) => {
  const email = req.query.email;
  const myPlants = plants.filter(p => p.sellerName === email);
  res.json(myPlants);
});

// Update a plant
app.put('/api/update-plant/:id', express.json(), (req, res) => {
  const id = Number(req.params.id);
  const index = plants.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false });
  }
  Object.assign(plants[index], req.body);
  saveData();
  res.json({
    success: true,
    plant: plants[index]
  });
});

// Seller dashboard sales & profit
app.get('/api/my-dashboard', (req, res) => {
  const email = req.query.email;
  const sellerPlants = plants.filter(p => p.sellerName === email);

  const dashboard = sellerPlants.map(p => {
    const plantSales = sales.filter(s => s.plantId === p.id);
    const salesCount = plantSales.reduce((sum, s) => sum + s.quantity, 0);
    let profit = "--";
    let booked = "--";

    if (salesCount > 0) {
      profit = (Number(p.price) * salesCount * 0.5).toFixed(2);
      booked = salesCount;
    }

    return {
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
});

// Admin login
app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === "admin" && password === "admin123") {
    res.json({ success: true });
  } else {
    res.status(401).json({
      success: false,
      message: "Invalid credentials"
    });
  }
});

// Register seller
app.post('/register-seller', upload.single('photo'), (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const existing = sellers.find(s => s.email === email);
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already registered' });
  }

  const newSeller = {
    id: Date.now(),
    name,
    email,
    password,
    phone,
    photoPath: req.file ? `/uploads/${req.file.filename}` : null
  };

  sellers.push(newSeller);
  saveData();

  res.json({ success: true });
});

// Login seller
app.post('/login-seller', express.json(), (req, res) => {
  const { email, password } = req.body;
  const seller = sellers.find(s => s.email === email && s.password === password);
  if (seller) {
    res.json({
      success: true,
      seller: {
        email: seller.email,
        name: seller.name,
        phone: seller.phone,
        photoPath: seller.photoPath
      }
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/register-user', upload.single('photo'), (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const customersFile = path.join(__dirname, 'data/customers.json');
  const existingCustomers = fs.existsSync(customersFile) ? JSON.parse(fs.readFileSync(customersFile)) : [];

  if (existingCustomers.find(u => u.email === email)) {
    return res.status(409).json({ success: false, message: 'Email already registered.' });
  }

  const newUser = {
    id: Date.now(),
    name,
    email,
    password,
    phone,
    photoPath: req.file ? `/uploads/${req.file.filename}` : null
  };

  existingCustomers.push(newUser);
  fs.writeFileSync(customersFile, JSON.stringify(existingCustomers, null, 2));

  res.json({ success: true });
});

app.post('/login-user', express.json(), (req, res) => {
  const { email, password } = req.body;

  const customersFile = path.join(__dirname, 'data/customers.json');
  const existingCustomers = fs.existsSync(customersFile) ? JSON.parse(fs.readFileSync(customersFile)) : [];

  const user = existingCustomers.find(u => u.email === email && u.password === password);
  if (user) {
    res.json({ success: true, user: { email: user.email, name: user.name } });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }
});

const salesPath = path.join(__dirname, 'data/sales.json');

app.post('/place-order', express.json(), (req, res) => {
  const { user, cart, address, payment } = req.body;
  const plants = JSON.parse(fs.readFileSync(plantsPath));
  let sales = fs.existsSync(salesPath) ? JSON.parse(fs.readFileSync(salesPath)) : [];

  const items = [];
  let total = 0;
  let ok = true;

  Object.keys(cart).forEach(id => {
    const plant = plants.find(p => p.id == id);
    if (!plant || plant.stock < cart[id]) {  // ✅ fixed this line
      ok = false;
    } else {
      plant.stock -= cart[id];
      const itemTotal = plant.price * cart[id];
      total += itemTotal;
      items.push({ ...plant, quantity: cart[id], subtotal: itemTotal });
    }
  });

  if (!ok) return res.status(400).json({ success: false, message: "Insufficient stock" });

  const order = {
    id: Date.now(),
    user,
    address,
    payment,
    items,
    total,
    timestamp: new Date().toISOString()
  };

  sales.push(order);
  fs.writeFileSync(salesPath, JSON.stringify(sales, null, 2));
  fs.writeFileSync(plantsPath, JSON.stringify(plants, null, 2)); // ✅ Saves updated stock

  res.json({ success: true });
});


app.post('/pay-order', express.json(), (req, res) => {
  const { user, cart, address, payment } = req.body;
  const plants = JSON.parse(fs.readFileSync(plantsPath));
  let sales = fs.existsSync(salesPath) ? JSON.parse(fs.readFileSync(salesPath)) : [];

  const items = [];
  let total = 0;
  let ok = true;

  Object.keys(cart).forEach(id => {
    const plant = plants.find(p => p.id == id);
    if (!plant || plant.stock < cart[id]) {
      ok = false;
    } else {
      plant.stock -= cart[id];
      const itemTotal = plant.price * cart[id];
      total += itemTotal;
      items.push({ ...plant, quantity: cart[id], subtotal: itemTotal });
    }
  });

  if (!ok) return res.status(400).json({ success: false, message: "Insufficient stock" });

  const order = {
    id: Date.now(),
    user,
    address,
    payment,
    items,
    total,
    timestamp: new Date().toISOString()
  };

  sales.push(order);
  fs.writeFileSync(salesPath, JSON.stringify(sales, null, 2));
  fs.writeFileSync(plantsPath, JSON.stringify(plants, null, 2));

  res.json({ success: true });
});

const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: 'rzp_test_btop9zW7LAr6UC',
  key_secret: 'FYMersDitnfb0lORO9bm4zqs'
});

app.post('/create-payment', express.json(), async (req, res) => {
  const { amount, name, email, cart, address } = req.body;

  // ✅ Validate required fields
  if (!email || typeof email !== 'string' || !email.includes("@")) {
    return res.status(400).json({ success: false, message: "❌ Invalid email format" });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: "❌ Invalid amount" });
  }

  try {
    // ✅ Create Razorpay payment link
    const payment = await razorpay.paymentLink.create({
      amount: amount * 100, // Razorpay expects paise
      currency: "INR",
      accept_partial: false,
      customer: {
        name: name || "Customer",
        email: email
      },
      notify: {
        sms: false,
        email: true
      },
      callback_url: "https://3c4b90062a15.ngrok-free.app/invoice.html",  // 🔁 Update when ngrok URL changes
      callback_method: "get"
    });

    // ✅ Store in pending-orders
    const pendingOrders = fs.existsSync(pendingPath)
      ? JSON.parse(fs.readFileSync(pendingPath))
      : [];

    pendingOrders.push({
      razorpayPaymentLinkId: payment.id,
      cart,
      user: name,
      address
    });

    fs.writeFileSync(pendingPath, JSON.stringify(pendingOrders, null, 2));

    res.json({ success: true, short_url: payment.short_url });

  } catch (err) {
    console.error("❌ Payment creation error:");
    console.error("→ Message:", err.message);
    console.error("→ Full error object:", err); // 👈 This helps debug Razorpay response
    res.status(500).json({ success: false, message: "Could not create payment link" });
  }
});

app.post('/admin/approve-order', (req, res) => {
  const { index } = req.body;
  const pendingPath = path.join(__dirname, 'data', 'pending-orders.json');
  const salesPath = path.join(__dirname, 'data', 'sales.json');
  const plantsPath = path.join(__dirname, 'data', 'plants.json');

  try {
    const pending = JSON.parse(fs.readFileSync(pendingPath));
    const sales = JSON.parse(fs.readFileSync(salesPath));
    const plants = JSON.parse(fs.readFileSync(plantsPath));

    const approvedOrder = pending[index];
    if (!approvedOrder) return res.json({ success: false, message: "Invalid order index" });

    const cart = approvedOrder.cart;

    // 🛑 STOCK VALIDATION
    for (const id in cart) {
      const plant = plants.find(p => p.id == id);
      const qty = cart[id];
      if (!plant) {
        return res.json({ success: false, message: `Plant ID ${id} not found.` });
      }
      if (plant.stock < qty) {
        return res.json({
          success: false,
          message: `❌ Not enough stock for ${plant.name}. Requested: ${qty}, Available: ${plant.stock}`
        });
      }
    }

    // ✅ All stock is available → process order
    const items = Object.entries(cart).map(([id, qty]) => {
      const plant = plants.find(p => p.id == id);
      plant.stock -= qty; // 🧮 Subtract stock now

      return {
        ...plant,
        quantity: qty,
        subtotal: plant.price * qty
      };
    });

    sales.push({
      id: Date.now(),
      user: approvedOrder.user,
      address: approvedOrder.address,
      items,
      payment: 'Cash on Delivery',
      total: items.reduce((t, i) => t + i.subtotal, 0),
      timestamp: new Date().toISOString()
    });

    pending.splice(index, 1); // ✅ remove approved order

    fs.writeFileSync(plantsPath, JSON.stringify(plants, null, 2));
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
    fs.writeFileSync(salesPath, JSON.stringify(sales, null, 2));

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});




// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
