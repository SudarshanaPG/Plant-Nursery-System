function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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
  const container = document.getElementById('plantDetail');
  if (!container) return;
  if (!id) {
    container.innerHTML = '<p>Item not found.</p>';
    return;
  }

  let item = null;
  try {
    const res = await fetch(`/plants/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Not found');
    item = await res.json();
  } catch {
    container.innerHTML = '<p>Item not found.</p>';
    return;
  }

  const category = String(item.category || 'PLANT').toUpperCase();
  const instructionLabel = category === 'PLANT' ? 'Care Instructions' : 'Description / How to Use';
  const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : [];
  const initialImage = item.imagePath || imageUrls[0] || '';

  let quantity = 1;
  let activeImage = initialImage;

  const render = () => {
    container.innerHTML = `
      <div class="detail-gallery">
        <img id="mainImage" src="${escapeHtml(activeImage)}" alt="${escapeHtml(item.name || 'Item')}">
        ${
          imageUrls.length > 1
            ? `<div class="detail-thumbs">
                ${imageUrls
                  .map(
                    (u) => `<button type="button" class="detail-thumb${u === activeImage ? ' active' : ''}" data-url="${escapeHtml(u)}">
                      <img src="${escapeHtml(u)}" alt="Photo">
                    </button>`
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>

      <h3>${escapeHtml(item.name || 'Untitled')}</h3>
      <p><strong>Category:</strong> ${escapeHtml(category)}</p>
      <p><strong>Price:</strong> INR ${escapeHtml(item.price)}</p>
      ${category === 'PLANT' && item.size ? `<p><strong>Size:</strong> ${escapeHtml(item.size)}</p>` : ''}
      <p><strong>Stock Available:</strong> ${
        item.stock > 0 ? escapeHtml(item.stock) : '<span style="color:red;">Out of Stock</span>'
      }</p>
      <p><strong>${escapeHtml(instructionLabel)}:</strong> ${escapeHtml(item.care || '')}</p>

      <label>Shipping Address:</label>
      <textarea id="address" rows="3" required placeholder="Enter your full address"></textarea>

      <label>Quantity:</label>
      <div style="margin-bottom: 1em;">
        <button type="button" id="qtyMinus">-</button>
        <span id="qtyDisplay" style="margin: 0 10px;">1</span>
        <button type="button" id="qtyPlus">+</button>
      </div>

      <div class="form-group" style="margin-top: 15px;">
        <label><strong>Payment Method:</strong></label><br>
        <label><input type="radio" name="payment" value="cod" checked> Cash on Delivery</label><br>
        <label><input type="radio" name="payment" value="online"> Online</label>
      </div>

      <div style="text-align:center; margin-top: 20px;">
        <button class="cta-button" id="orderBtn"${item.stock <= 0 ? ' disabled' : ''}>Place Order</button>
      </div>
    `;

    container.querySelectorAll('[data-url]').forEach((btn) => {
      btn.onclick = () => {
        const url = btn.getAttribute('data-url');
        if (!url) return;
        activeImage = url;
        render();
      };
    });

    const qtyDisplay = document.getElementById('qtyDisplay');
    const updateQty = (delta) => {
      quantity += delta;
      if (quantity < 1) quantity = 1;
      if (quantity > item.stock) {
        alert(`Only ${item.stock} in stock.`);
        quantity = item.stock;
      }
      if (qtyDisplay) qtyDisplay.textContent = String(quantity);
    };

    document.getElementById('qtyMinus').onclick = () => updateQty(-1);
    document.getElementById('qtyPlus').onclick = () => updateQty(1);

    document.getElementById('orderBtn').onclick = () => {
      const address = String(document.getElementById('address').value || '').trim();
      const payment = document.querySelector("input[name='payment']:checked")?.value || 'cod';

      if (!address) {
        alert('Please enter your shipping address.');
        return;
      }

      const orderData = {
        items: [
          {
            name: item.name,
            price: item.price,
            quantity
          }
        ],
        total: item.price * quantity,
        paymentMethod: payment === 'online' ? 'Online' : 'Cash on Delivery',
        address
      };

      if (payment === 'cod') {
        fetch(`/buy/${item.id}`, {
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
            cart: { [item.id]: quantity },
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
  };

  render();
});

