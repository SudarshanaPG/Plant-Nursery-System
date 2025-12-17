document.addEventListener('DOMContentLoaded', async () => {
  const itemsDiv = document.getElementById('items');
  const totalDiv = document.getElementById('total');
  const placeOrderButton = document.getElementById('place-order');

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
    window.location.href = `/auth/google?next=${encodeURIComponent('/order.html')}`;
    return;
  }

  const cart = JSON.parse(sessionStorage.getItem('cart') || '{}');
  const cartEntries = Object.entries(cart);

  const loadPlants = async () => {
    const cached = JSON.parse(localStorage.getItem('plants') || '[]');
    if (Array.isArray(cached) && cached.length) return cached;

    const res = await fetch('/data/plants.json?ts=' + Date.now());
    return await res.json();
  };

  let plants = [];
  try {
    plants = await loadPlants();
  } catch (err) {
    console.error('Failed to load plants:', err);
  }

  let total = 0;
  const orderItems = [];

  itemsDiv.innerHTML = '';

  for (const [id, qtyRaw] of cartEntries) {
    const plant = plants.find((p) => p.id == id);
    const quantity = Number.parseInt(qtyRaw, 10) || 0;
    if (!plant || quantity < 1) continue;

    const itemTotal = quantity * plant.price;
    total += itemTotal;
    orderItems.push({ name: plant.name, price: plant.price, quantity });

    const card = document.createElement('div');
    card.className = 'plant-card';
    card.innerHTML = `
      <img src="${plant.imagePath}" alt="${plant.name}">
      <h3>${plant.name}</h3>
      <p><strong>Price:</strong> ₹${plant.price} x ${quantity} = ₹${itemTotal}</p>
      <p><strong>Size:</strong> ${plant.size}</p>
      <p><strong>Care Instructions:</strong> ${plant.care}</p>
      <p><strong>Available Stock:</strong> ${plant.stock}</p>
    `;
    itemsDiv.appendChild(card);
  }

  if (orderItems.length === 0) {
    itemsDiv.innerHTML = `<p style="color:red;">No items to confirm.</p>`;
    totalDiv.innerText = `Total: ₹0`;
    if (placeOrderButton) placeOrderButton.disabled = true;
    return;
  }

  totalDiv.innerText = `Total: ₹${total}`;

  placeOrderButton?.addEventListener('click', async () => {
    const address = document.getElementById('address')?.value?.trim() || '';
    const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value;

    if (!address) return alert('Please enter a shipping address.');
    if (!paymentMethod) return alert('Please choose a payment method.');

    const invoicePayload = {
      items: orderItems,
      total,
      paymentMethod: paymentMethod === 'online' ? 'Online' : 'Cash on Delivery',
      address
    };

    const orderPayload = {
      email: me.email,
      address,
      cart,
      payment: invoicePayload.paymentMethod
    };

    if (paymentMethod === 'online') {
      try {
        const res = await fetch('/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: total,
            name: me.email,
            email: me.email,
            cart: orderPayload.cart,
            address: orderPayload.address
          })
        });
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('latestOrder', JSON.stringify(invoicePayload));
          localStorage.removeItem(`cart_${me.email}`);
          sessionStorage.removeItem('cart');
          window.location.href = data.short_url;
        } else {
          alert(data.message || 'Could not create payment link.');
        }
      } catch (err) {
        console.error('Payment error:', err);
        alert('Payment error');
      }

      return;
    }

    try {
      const res = await fetch('/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('latestOrder', JSON.stringify(invoicePayload));
        localStorage.removeItem(`cart_${me.email}`);
        sessionStorage.removeItem('cart');
        alert('Order placed successfully!');
        window.location.href = 'invoice.html';
      } else {
        alert('Order failed: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Order error:', err);
      alert('Order failed.');
    }
  });
});
