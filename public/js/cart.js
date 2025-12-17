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
  let cart = JSON.parse(localStorage.getItem(cartKey)) || {};
  const container = document.getElementById('cart-items');
  const totalDisplay = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkoutBtn');

  fetch('/data/plants.json')
    .then((res) => {
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    })
    .then((plants) => {
      localStorage.setItem('plants', JSON.stringify(plants));

      container.innerHTML = '';
      let total = 0;
      const validCart = {};

      Object.keys(cart).forEach((id) => {
        const plant = plants.find((p) => p.id == id);
        if (!plant) return;

        const qty = cart[id];
        const availableStock = parseInt(plant.stock) || 0;
        const subtotal = plant.price * qty;
        total += subtotal;
        validCart[id] = qty;

        const div = document.createElement('div');
        div.className = 'plant-card';
        div.innerHTML = `
          <img src="${plant.imagePath}" alt="${plant.name}">
            <div class="plant-info">
              <h3>${plant.name}</h3>
            <p>Price: ₹${plant.price}</p>
            <p><strong>Stock:</strong> ${availableStock > 0 ? availableStock : 'Out of stock'}</p>
            <p>Care: ${plant.care}</p>
            <div class="qty-controls">
              <button class="dec">-</button>
              <span class="qty">${qty}</span>
              <button class="inc">+</button>
            </div>
            <p>Subtotal: ₹${subtotal}</p>
          </div>
        `;
        container.appendChild(div);

        div.querySelector('.inc').onclick = () => {
          if (qty + 1 > availableStock) {
            alert(`Only ${availableStock} available in stock.`);
            return;
          }
          cart[id]++;
          localStorage.setItem(cartKey, JSON.stringify(cart));
          location.reload();
        };

        div.querySelector('.dec').onclick = () => {
          if (qty <= 1) {
            delete cart[id];
          } else {
            cart[id]--;
          }
          localStorage.setItem(cartKey, JSON.stringify(cart));
          location.reload();
        };
      });

      totalDisplay.textContent = `Total: ₹${total}`;
      localStorage.setItem(cartKey, JSON.stringify(validCart));

      checkoutBtn.onclick = () => {
        if (Object.keys(validCart).length === 0) {
          alert('Your cart is empty.');
          return;
        }
        sessionStorage.setItem('cart', JSON.stringify(validCart));
        window.location.href = 'order.html';
      };
    })
    .catch((err) => {
      console.error('Error loading cart items:', err);
      container.innerHTML = '<p>Error loading cart items.</p>';
    });
});
