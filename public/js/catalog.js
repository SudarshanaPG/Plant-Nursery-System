document.addEventListener('DOMContentLoaded', async () => {
  const category = String(document.body?.dataset?.category || 'PLANT').toUpperCase();

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

  const url = `/catalog?category=${encodeURIComponent(category)}&ts=${Date.now()}`;

  fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    })
    .then((items) => {
      container.innerHTML = '';

      if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = "<p style='text-align:center;'>No items available yet.</p>";
        return;
      }

      items.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'plant-card';

        card.innerHTML = `
          <img src="${item.imagePath || ''}" alt="${item.name || 'Item'}" />
          <h3>${item.name || 'Untitled'}</h3>
          <p><strong>Price:</strong> INR ${item.price}</p>
          <p><strong>Stock:</strong> ${item.stock}</p>
          <button class="book-now" data-id="${item.id}">View</button>
          <button class="add-to-cart" data-id="${item.id}">Add to Cart</button>
        `;

        container.appendChild(card);
      });

      document.querySelectorAll('.book-now').forEach((btn) => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-id');
          window.location.href = `plant-detail.html?id=${id}`;
        };
      });

      document.querySelectorAll('.add-to-cart').forEach((btn) => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-id');
          const cartKey = `cart_${me.email}`;
          const cart = JSON.parse(localStorage.getItem(cartKey) || '{}');
          cart[id] = (cart[id] || 0) + 1;
          localStorage.setItem(cartKey, JSON.stringify(cart));
          alert('Added to cart.');
        };
      });
    })
    .catch((error) => {
      console.error('Error loading catalog:', error);
      container.innerHTML = '<p>Could not load items.</p>';
    });
});
