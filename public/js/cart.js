const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatMoney = (value) => {
  const numberValue = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(numberValue);
  } catch {
    return `INR ${numberValue.toFixed(2)}`;
  }
};

const loadCatalog = async () => {
  const cached = JSON.parse(localStorage.getItem('catalog') || '[]');
  try {
    const res = await fetch(`/catalog?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load catalog');
    const catalog = await res.json();
    if (Array.isArray(catalog)) {
      localStorage.setItem('catalog', JSON.stringify(catalog));
      return catalog;
    }
  } catch (error) {
    console.error('Error loading catalog:', error);
  }
  return Array.isArray(cached) ? cached : [];
};

document.addEventListener('DOMContentLoaded', async () => {
  const ui = window.GreenLeafUI;

  let me = null;
  try {
    const res = await fetch('/api/me', { cache: 'no-store' });
    const data = await res.json();
    me = data.user || null;
    if (me?.email) localStorage.setItem('loggedInUser', me.email);
  } catch {
    me = null;
  }

  if (!me) {
    window.location.href = `/auth/google?next=${encodeURIComponent('/cart.html')}`;
    return;
  }

  const cartKey = `cart_${me.email}`;
  let cart = JSON.parse(localStorage.getItem(cartKey) || '{}');
  const container = document.getElementById('cart-items');
  const totalDisplay = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkoutBtn');

  if (!container || !totalDisplay || !checkoutBtn) return;

  const catalog = await loadCatalog();
  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((item) => [String(item.id), item]));

  const syncCart = () => {
    const validCart = {};
    Object.entries(cart).forEach(([id, qtyRaw]) => {
      const item = catalogById.get(String(id));
      const qty = Number.parseInt(qtyRaw, 10) || 0;
      if (!item || qty < 1) return;
      const stock = Number.parseInt(item.stock, 10) || 0;
      if (stock < 1) return;
      validCart[id] = Math.min(qty, stock);
    });
    cart = validCart;
    localStorage.setItem(cartKey, JSON.stringify(cart));
    return validCart;
  };

  const render = () => {
    const validCart = syncCart();
    container.innerHTML = '';

    let total = 0;
    const entries = Object.entries(validCart);

    if (!entries.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Your basket is empty right now.</p>
          <a href="plants.html" class="cta-button secondary">Browse plants</a>
        </div>
      `;
      totalDisplay.textContent = 'Total: INR 0.00';
      checkoutBtn.disabled = true;
      return;
    }

    entries.forEach(([id, qty]) => {
      const item = catalogById.get(String(id));
      if (!item) return;

      const stock = Number.parseInt(item.stock, 10) || 0;
      const subtotal = Number(item.price || 0) * qty;
      total += subtotal;

      const card = document.createElement('article');
      card.className = 'plant-card';
      card.innerHTML = `
        <img src="${escapeHtml(item.imagePath || '')}" alt="${escapeHtml(item.name || 'Item')}">
        <h3>${escapeHtml(item.name || 'Untitled')}</h3>
        <p><strong>Price:</strong> ${escapeHtml(formatMoney(item.price))}</p>
        <p><strong>Available:</strong> ${stock > 0 ? escapeHtml(String(stock)) : 'Out of stock'}</p>
        <p>${item.care ? `<strong>Info:</strong> ${escapeHtml(item.care)}` : ''}</p>
        <div class="qty-stepper">
          <button class="dec" type="button" aria-label="Decrease quantity">-</button>
          <span class="qty-value">${qty}</span>
          <button class="inc" type="button" aria-label="Increase quantity">+</button>
        </div>
        <p><strong>Subtotal:</strong> ${escapeHtml(formatMoney(subtotal))}</p>
      `;

      card.querySelector('.inc')?.addEventListener('click', () => {
        if (qty + 1 > stock) {
          ui?.notify({
            title: 'Stock limit reached',
            message: `Only ${stock} item(s) are available right now.`,
            tone: 'warning'
          });
          return;
        }
        cart[id] = qty + 1;
        render();
      });

      card.querySelector('.dec')?.addEventListener('click', () => {
        if (qty <= 1) {
          delete cart[id];
        } else {
          cart[id] = qty - 1;
        }
        render();
      });

      container.appendChild(card);
    });

    totalDisplay.textContent = `Total: ${formatMoney(total)}`;
    checkoutBtn.disabled = false;
  };

  checkoutBtn.addEventListener('click', () => {
    const validCart = syncCart();
    if (!Object.keys(validCart).length) {
      ui?.notify({
        title: 'Basket is empty',
        message: 'Add a few items before you continue to checkout.',
        tone: 'warning'
      });
      return;
    }

    sessionStorage.setItem('cart', JSON.stringify(validCart));
    window.location.href = 'order.html';
  });

  render();
});
