document.addEventListener('DOMContentLoaded', async () => {
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
  const cart = JSON.parse(localStorage.getItem(cartKey) || '{}');
  const container = document.getElementById('cart-items');
  const totalDisplay = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkoutBtn');

  if (!container || !totalDisplay || !checkoutBtn) return;

  let catalog = [];
  try {
    const res = await fetch('/catalog?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load catalog');
    catalog = await res.json();
  } catch (err) {
    console.error('Error loading catalog:', err);
    container.innerHTML = '<p>Error loading cart items.</p>';
    return;
  }

  localStorage.setItem('catalog', JSON.stringify(catalog));

  container.innerHTML = '';
  let total = 0;
  const validCart = {};

  for (const [id, qtyRaw] of Object.entries(cart)) {
    const item = catalog.find((p) => String(p.id) === String(id));
    const qty = Number.parseInt(qtyRaw, 10) || 0;
    if (!item || qty < 1) continue;

    const availableStock = Number.parseInt(item.stock, 10) || 0;
    const subtotal = item.price * qty;
    total += subtotal;
    validCart[id] = qty;

    const div = document.createElement('div');
    div.className = 'plant-card';
    div.innerHTML = `
      <img src="${item.imagePath || ''}" alt="${item.name || 'Item'}">
      <div class="plant-info">
        <h3>${item.name || 'Untitled'}</h3>
        <p>Price: INR ${item.price}</p>
        <p><strong>Stock:</strong> ${availableStock > 0 ? availableStock : 'Out of stock'}</p>
        <p>${item.care ? `Info: ${item.care}` : ''}</p>
        <div class="qty-controls">
          <button class="dec" type="button">-</button>
          <span class="qty">${qty}</span>
          <button class="inc" type="button">+</button>
        </div>
        <p>Subtotal: INR ${subtotal}</p>
      </div>
    `;
    container.appendChild(div);

    div.querySelector('.inc').onclick = () => {
      if (qty + 1 > availableStock) {
        alert(`Only ${availableStock} available in stock.`);
        return;
      }
      cart[id] = qty + 1;
      localStorage.setItem(cartKey, JSON.stringify(cart));
      location.reload();
    };

    div.querySelector('.dec').onclick = () => {
      if (qty <= 1) {
        delete cart[id];
      } else {
        cart[id] = qty - 1;
      }
      localStorage.setItem(cartKey, JSON.stringify(cart));
      location.reload();
    };
  }

  totalDisplay.textContent = `Total: INR ${total}`;
  localStorage.setItem(cartKey, JSON.stringify(validCart));

  checkoutBtn.onclick = () => {
    if (Object.keys(validCart).length === 0) {
      alert('Your cart is empty.');
      return;
    }
    sessionStorage.setItem('cart', JSON.stringify(validCart));
    window.location.href = 'order.html';
  };
});
