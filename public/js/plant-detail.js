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
    window.location.href = `/auth/google?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('plantDetail').innerHTML = '<p>Plant not found.</p>';
    return;
  }

  fetch(`/data/plants.json?ts=${Date.now()}`)
    .then((res) => res.json())
    .then((plants) => {
      const plant = plants.find((p) => p.id == id);
      const container = document.getElementById('plantDetail');

      if (!plant) {
        container.innerHTML = '<p>Plant not found.</p>';
        return;
      }

      let quantity = 1;

      const updateQuantityDisplay = () => {
        document.getElementById('qtyDisplay').textContent = quantity;
      };

      container.innerHTML = `
        <img src="${plant.imagePath}" alt="${plant.name}">
        <h3>${plant.name}</h3>
        <p><strong>Price:</strong> ₹${plant.price}</p>
        <p><strong>Size:</strong> ${plant.size}</p>
        <p><strong>Stock Available:</strong> ${plant.stock > 0 ? plant.stock : '<span style="color:red;">Out of Stock</span>'}</p>
        <p><strong>Care Instructions:</strong> ${plant.care}</p>

        <label>Shipping Address:</label>
        <textarea id="address" rows="3" required placeholder="Enter your full address"></textarea>

        <label>Quantity:</label>
        <div style="margin-bottom: 1em;">
          <button onclick="changeQty(-1)">-</button>
          <span id="qtyDisplay" style="margin: 0 10px;">1</span>
          <button onclick="changeQty(1)">+</button>
        </div>

        <div class="form-group" style="margin-top: 15px;">
          <label><strong>Payment Method:</strong></label><br>
          <label><input type="radio" name="payment" value="cod" checked> Cash on Delivery</label><br>
          <label><input type="radio" name="payment" value="online"> Online (QR Code)</label>
        </div>

        <div style="text-align:center; margin-top: 20px;">
          <button class="cta-button" id="orderBtn"${plant.stock <= 0 ? ' disabled' : ''}>Place Order</button>
        </div>
      `;

      window.changeQty = function (delta) {
        quantity += delta;
        if (quantity < 1) quantity = 1;
        if (quantity > plant.stock) {
          alert(`Only ${plant.stock} in stock.`);
          quantity = plant.stock;
        }
        updateQuantityDisplay();
      };

      updateQuantityDisplay();

      document.getElementById('orderBtn').onclick = () => {
        const address = document.getElementById('address').value.trim();
        const payment = document.querySelector("input[name='payment']:checked").value;

        if (!address) {
          alert('Please enter your shipping address.');
          return;
        }

        const orderData = {
          items: [
            {
              name: plant.name,
              price: plant.price,
              quantity
            }
          ],
          total: plant.price * quantity,
          paymentMethod: payment === 'online' ? 'Online (QR Code)' : 'Cash on Delivery',
          address
        };

        if (payment === 'cod') {
          fetch(`/buy/${plant.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quantity,
              address,
              email: me.email
            })
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                localStorage.setItem('latestOrder', JSON.stringify(orderData));
                alert('Order placed successfully.');
                window.location.href = 'invoice.html';
              } else {
                alert(data.message || 'Failed to place order.');
              }
            });
        } else {
          fetch('/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: orderData.total,
              name: me.email,
              email: me.email,
              cart: { [plant.id]: quantity },
              address
            })
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                localStorage.setItem('latestOrder', JSON.stringify(orderData));
                window.location.href = data.short_url;
              } else {
                alert(data.message || 'Could not generate payment link');
              }
            });
        }
      };
    });
});
