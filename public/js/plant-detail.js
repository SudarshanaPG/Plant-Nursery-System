const CHECKOUT_PROFILE_KEY = 'greenleaf:checkout-profile';

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

const getCheckoutProfile = () => {
  try {
    return JSON.parse(localStorage.getItem(CHECKOUT_PROFILE_KEY) || '{}');
  } catch {
    return {};
  }
};

const saveCheckoutProfile = (profile) => {
  try {
    localStorage.setItem(CHECKOUT_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage failures
  }
};

const composeAddress = (profile) =>
  [
    `${profile.recipientName} | ${profile.phone}`,
    profile.addressLine1,
    profile.addressLine2,
    `${profile.city}, ${profile.state} ${profile.postalCode}`,
    profile.landmark ? `Landmark: ${profile.landmark}` : '',
    profile.deliveryNote ? `Delivery note: ${profile.deliveryNote}` : ''
  ]
    .filter(Boolean)
    .join('\n');

const normalisePhone = (value) => String(value || '').replace(/[^\d+]/g, '');

const syncPaymentChoices = () => {
  document.querySelectorAll('.payment-choice').forEach((choice) => {
    const input = choice.querySelector('input[type="radio"]');
    choice.classList.toggle('is-selected', Boolean(input?.checked));
  });
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
    window.location.href = `/auth/google?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const container = document.getElementById('plantDetail');
  if (!container) return;
  if (!id) {
    container.innerHTML = '<div class="empty-state">Item not found.</div>';
    return;
  }

  let item = null;
  try {
    const res = await fetch(`/plants/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Not found');
    item = await res.json();
  } catch {
    container.innerHTML = '<div class="empty-state">Item not found.</div>';
    return;
  }

  const category = String(item.category || 'PLANT').toUpperCase();
  const instructionLabel = category === 'PLANT' ? 'Care instructions' : 'Usage details';
  const imageUrls =
    Array.isArray(item.imageUrls) && item.imageUrls.length ? item.imageUrls : [item.imagePath].filter(Boolean);
  const initialImage = item.imagePath || imageUrls[0] || '';
  let quantity = 1;
  let activeImage = initialImage;

  const render = () => {
    const savedProfile = getCheckoutProfile();

    container.innerHTML = `
      <div class="product-layout">
        <div class="product-main">
          <span class="section-eyebrow">${escapeHtml(category)}</span>
          <div class="detail-gallery">
            <img id="mainImage" src="${escapeHtml(activeImage)}" alt="${escapeHtml(item.name || 'Item')}">
            ${
              imageUrls.length > 1
                ? `<div class="detail-thumbs">
                    ${imageUrls
                      .map(
                        (url) => `
                          <button type="button" class="detail-thumb${url === activeImage ? ' active' : ''}" data-url="${escapeHtml(url)}">
                            <img src="${escapeHtml(url)}" alt="Photo">
                          </button>
                        `
                      )
                      .join('')}
                  </div>`
                : ''
            }
          </div>

          <h2 class="section-title section-title-plain section-title-tight">${escapeHtml(item.name || 'Untitled')}</h2>
          <div class="detail-meta">
            <span class="price-badge">${escapeHtml(formatMoney(item.price))}</span>
            <span class="stat-pill">${item.stock > 0 ? `${escapeHtml(String(item.stock))} in stock` : 'Out of stock'}</span>
            ${category === 'PLANT' && item.size ? `<span class="stat-pill">${escapeHtml(item.size)}</span>` : ''}
          </div>
          <div class="detail-summary">
            <p><strong>Category:</strong> ${escapeHtml(category)}</p>
            <p><strong>${escapeHtml(instructionLabel)}:</strong> ${escapeHtml(item.care || 'No extra details yet.')}</p>
          </div>
        </div>

        <aside class="product-buy-panel">
          <span class="section-eyebrow">Quick checkout</span>
          <h2 class="section-title section-title-plain">Send it to your garden</h2>
          <p class="section-copy">Structured delivery fields, clear payment choice, and a softer order flow.</p>

          <form id="productOrderForm" class="checkout-form">
            <div class="field">
              <span>Quantity</span>
              <div class="qty-stepper">
                <button type="button" id="qtyMinus" aria-label="Decrease quantity">-</button>
                <span class="qty-value" id="qtyDisplay">${quantity}</span>
                <button type="button" id="qtyPlus" aria-label="Increase quantity">+</button>
              </div>
            </div>

            <div class="form-grid">
              <label class="field">
                <span>Recipient name</span>
                <input id="recipientName" type="text" autocomplete="name" value="${escapeHtml(savedProfile.recipientName || me.name || '')}" required />
              </label>
              <label class="field">
                <span>Mobile number</span>
                <input id="phone" type="tel" inputmode="tel" autocomplete="tel" value="${escapeHtml(savedProfile.phone || '')}" required />
              </label>
              <label class="field field-full">
                <span>Address line 1</span>
                <input id="addressLine1" type="text" autocomplete="address-line1" value="${escapeHtml(savedProfile.addressLine1 || '')}" required />
              </label>
              <label class="field field-full">
                <span>Address line 2</span>
                <input id="addressLine2" type="text" autocomplete="address-line2" value="${escapeHtml(savedProfile.addressLine2 || '')}" />
              </label>
              <label class="field">
                <span>City</span>
                <input id="city" type="text" autocomplete="address-level2" value="${escapeHtml(savedProfile.city || '')}" required />
              </label>
              <label class="field">
                <span>State</span>
                <input id="state" type="text" autocomplete="address-level1" value="${escapeHtml(savedProfile.state || '')}" required />
              </label>
              <label class="field">
                <span>Postal code</span>
                <input id="postalCode" type="text" inputmode="numeric" autocomplete="postal-code" value="${escapeHtml(savedProfile.postalCode || '')}" required />
              </label>
              <label class="field">
                <span>Landmark</span>
                <input id="landmark" type="text" value="${escapeHtml(savedProfile.landmark || '')}" />
              </label>
            </div>

            <label class="field">
              <span>Delivery note</span>
              <textarea id="deliveryNote" rows="4">${escapeHtml(savedProfile.deliveryNote || '')}</textarea>
            </label>

            <div class="field">
              <span>Payment method</span>
              <div class="payment-choices" id="paymentChoices">
                <label class="payment-choice is-selected">
                  <input type="radio" name="payment" value="cod" checked />
                  <div class="payment-copy">
                    <strong>Cash on delivery</strong>
                    <span>Pay when the order reaches your doorstep.</span>
                  </div>
                </label>
                <label class="payment-choice">
                  <input type="radio" name="payment" value="online" />
                  <div class="payment-copy">
                    <strong>Online payment</strong>
                    <span>Get redirected to the payment link before we finalise the order.</span>
                  </div>
                </label>
              </div>
            </div>

            <div class="manage-actions">
              <button type="button" class="cta-button secondary" id="addToCartBtn"${item.stock <= 0 ? ' disabled' : ''}>Add to cart</button>
              <button type="submit" class="cta-button" id="orderBtn"${item.stock <= 0 ? ' disabled' : ''}>Place order</button>
            </div>
          </form>
        </aside>
      </div>
    `;

    container.querySelectorAll('[data-url]').forEach((button) => {
      button.addEventListener('click', () => {
        const url = button.getAttribute('data-url');
        if (!url) return;
        activeImage = url;
        render();
      });
    });

    const qtyDisplay = document.getElementById('qtyDisplay');
    const updateQty = (delta) => {
      const nextQuantity = quantity + delta;
      if (nextQuantity < 1) {
        quantity = 1;
      } else if (nextQuantity > item.stock) {
        ui?.notify({
          title: 'Stock limit reached',
          message: `Only ${item.stock} item(s) are available right now.`,
          tone: 'warning'
        });
        quantity = item.stock;
      } else {
        quantity = nextQuantity;
      }
      if (qtyDisplay) qtyDisplay.textContent = String(quantity);
    };

    document.getElementById('qtyMinus')?.addEventListener('click', () => updateQty(-1));
    document.getElementById('qtyPlus')?.addEventListener('click', () => updateQty(1));

    document.querySelectorAll('input[name="payment"]').forEach((radio) => {
      radio.addEventListener('change', syncPaymentChoices);
    });
    syncPaymentChoices();

    document.getElementById('addToCartBtn')?.addEventListener('click', () => {
      const cartKey = `cart_${me.email}`;
      const cart = JSON.parse(localStorage.getItem(cartKey) || '{}');
      const nextQty = (cart[item.id] || 0) + quantity;
      if (nextQty > item.stock) {
        ui?.notify({
          title: 'Stock limit reached',
          message: `Only ${item.stock} item(s) are available right now.`,
          tone: 'warning'
        });
        return;
      }
      cart[item.id] = nextQty;
      localStorage.setItem(cartKey, JSON.stringify(cart));
      ui?.notify({
        title: `${item.name} added`,
        message: `${quantity} item(s) are now waiting in your basket.`,
        tone: 'success'
      });
    });

    document.getElementById('productOrderForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const profile = {
        recipientName: String(document.getElementById('recipientName')?.value || '').trim(),
        phone: normalisePhone(document.getElementById('phone')?.value),
        addressLine1: String(document.getElementById('addressLine1')?.value || '').trim(),
        addressLine2: String(document.getElementById('addressLine2')?.value || '').trim(),
        city: String(document.getElementById('city')?.value || '').trim(),
        state: String(document.getElementById('state')?.value || '').trim(),
        postalCode: String(document.getElementById('postalCode')?.value || '').trim(),
        landmark: String(document.getElementById('landmark')?.value || '').trim(),
        deliveryNote: String(document.getElementById('deliveryNote')?.value || '').trim()
      };

      if (!profile.recipientName || !profile.phone || !profile.addressLine1 || !profile.city || !profile.state || !profile.postalCode) {
        ui?.notify({
          title: 'Missing delivery details',
          message: 'Fill out the required address fields before placing the order.',
          tone: 'warning'
        });
        return;
      }

      if (!/^\+?\d{10,15}$/.test(profile.phone)) {
        ui?.notify({
          title: 'Check the mobile number',
          message: 'Enter a valid 10 to 15 digit contact number.',
          tone: 'warning'
        });
        document.getElementById('phone')?.focus();
        return;
      }

      if (!/^[A-Za-z0-9 -]{4,10}$/.test(profile.postalCode)) {
        ui?.notify({
          title: 'Check the postal code',
          message: 'Use a valid PIN or ZIP code.',
          tone: 'warning'
        });
        document.getElementById('postalCode')?.focus();
        return;
      }

      saveCheckoutProfile(profile);

      const address = composeAddress(profile);
      const payment = document.querySelector("input[name='payment']:checked")?.value || 'cod';
      const orderData = {
        items: [{ name: item.name, price: item.price, quantity }],
        total: Number(item.price || 0) * quantity,
        paymentMethod: payment === 'online' ? 'Online' : 'Cash on Delivery',
        address,
        customer: { recipientName: profile.recipientName, phone: profile.phone },
        clearCartOnInvoice: false
      };

      const orderButton = document.getElementById('orderBtn');
      if (orderButton) orderButton.disabled = true;

      if (payment === 'cod') {
        try {
          const response = await fetch(`/buy/${item.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quantity,
              address,
              email: me.email
            })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.success) throw new Error(data.message || 'Failed to place order.');

          localStorage.setItem('latestOrder', JSON.stringify(orderData));
          ui?.queueNotification({
            title: 'Order rooted',
            message: 'Your plant is on its way.',
            tone: 'success'
          });
          window.location.href = 'invoice.html';
        } catch (error) {
          console.error(error);
          ui?.notify({
            title: 'Order failed',
            message: error.message || 'Could not place the order.',
            tone: 'error'
          });
          if (orderButton) orderButton.disabled = false;
        }
        return;
      }

      try {
        const response = await fetch('/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: orderData.total,
            name: profile.recipientName,
            email: me.email,
            cart: { [item.id]: quantity },
            address
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not generate payment link.');

        localStorage.setItem('latestOrder', JSON.stringify(orderData));
        ui?.queueNotification({
          title: 'Payment link ready',
          message: 'Complete payment to confirm this order.',
          tone: 'success'
        });
        window.location.href = data.short_url;
      } catch (error) {
        console.error(error);
        ui?.notify({
          title: 'Payment link failed',
          message: error.message || 'Could not generate payment link.',
          tone: 'error'
        });
        if (orderButton) orderButton.disabled = false;
      }
    });
  };

  render();
});
