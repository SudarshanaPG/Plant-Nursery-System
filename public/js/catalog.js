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

document.addEventListener('DOMContentLoaded', async () => {
  const category = String(document.body?.dataset?.category || 'PLANT').toUpperCase();
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
    window.location.href = `/auth/google?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }

  const container = document.getElementById('plants-container');
  if (!container) return;

  try {
    const response = await fetch(`/catalog?category=${encodeURIComponent(category)}&ts=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Could not load catalog');

    const items = await response.json();
    container.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      container.innerHTML = '<div class="empty-state">No products are available in this section yet.</div>';
      return;
    }

    items.forEach((item) => {
      const stock = Number.parseInt(item.stock, 10) || 0;
      const card = document.createElement('article');
      card.className = 'plant-card';
      card.dataset.stock = String(stock);
      card.innerHTML = `
        <img src="${escapeHtml(item.imagePath || '')}" alt="${escapeHtml(item.name || 'Item')}" />
        <h3>${escapeHtml(item.name || 'Untitled')}</h3>
        <p><strong>Price:</strong> ${escapeHtml(formatMoney(item.price))}</p>
        <p><strong>Stock:</strong> ${stock > 0 ? escapeHtml(String(stock)) : 'Out of stock'}</p>
        <button class="book-now" type="button" data-id="${item.id}">View details</button>
        <button class="add-to-cart" type="button" data-id="${item.id}"${stock <= 0 ? ' disabled' : ''}>Add to cart</button>
      `;

      container.appendChild(card);
    });

    container.querySelectorAll('.book-now').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-id');
        window.location.href = `plant-detail.html?id=${id}`;
      });
    });

    container.querySelectorAll('.add-to-cart').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-id');
        if (!id) return;

        const cartKey = `cart_${me.email}`;
        const cart = JSON.parse(localStorage.getItem(cartKey) || '{}');
        const nextQty = (cart[id] || 0) + 1;
        const stock = Number.parseInt(button.closest('.plant-card')?.dataset.stock || '0', 10);
        if (stock && nextQty > stock) {
          ui?.notify({
            title: 'Stock limit reached',
            message: `Only ${stock} item(s) are available right now.`,
            tone: 'warning'
          });
          return;
        }
        cart[id] = nextQty;
        localStorage.setItem(cartKey, JSON.stringify(cart));

        const productName =
          button.closest('.plant-card')?.querySelector('h3')?.textContent?.trim() || 'Item';
        ui?.notify({
          title: `${productName} added`,
          message: 'Your basket has been updated.',
          tone: 'success'
        });
      });
    });
  } catch (error) {
    console.error('Error loading catalog:', error);
    container.innerHTML = '<div class="empty-state">Could not load items right now.</div>';
  }
});
