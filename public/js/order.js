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
    console.error('Failed to load catalog:', error);
  }
  return Array.isArray(cached) ? cached : [];
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

const renderEmptyState = (itemsDiv, totalDiv, form, button) => {
  itemsDiv.innerHTML = `
    <div class="empty-state">
      <p>No items are available to confirm right now.</p>
      <a href="cart.html" class="cta-button secondary">Return to cart</a>
    </div>
  `;
  totalDiv.textContent = 'Total: INR 0.00';
  if (button) button.disabled = true;
  if (form) form.querySelectorAll('input, textarea, button').forEach((element) => (element.disabled = true));
};

document.addEventListener('DOMContentLoaded', async () => {
  const ui = window.GreenLeafUI;
  const itemsDiv = document.getElementById('items');
  const totalDiv = document.getElementById('total');
  const form = document.getElementById('checkoutForm');
  const placeOrderButton = document.getElementById('place-order');
  const orderStatus = document.getElementById('orderStatus');

  if (!itemsDiv || !totalDiv || !form || !placeOrderButton) return;

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

  const cartKey = `cart_${me.email}`;
  const cart = JSON.parse(sessionStorage.getItem('cart') || localStorage.getItem(cartKey) || '{}');
  const catalog = await loadCatalog();
  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((item) => [String(item.id), item]));

  let total = 0;
  const orderItems = [];
  const validCart = {};

  itemsDiv.innerHTML = '';

  Object.entries(cart).forEach(([id, qtyRaw]) => {
    const item = catalogById.get(String(id));
    const quantity = Number.parseInt(qtyRaw, 10) || 0;
    if (!item || quantity < 1) return;

    const availableStock = Number.parseInt(item.stock, 10) || 0;
    if (availableStock < 1) return;

    const safeQuantity = Math.min(quantity, availableStock);
    const itemTotal = safeQuantity * Number(item.price || 0);
    total += itemTotal;
    validCart[id] = safeQuantity;
    orderItems.push({ name: item.name, price: item.price, quantity: safeQuantity });

    const category = String(item.category || 'PLANT').toUpperCase();
    const card = document.createElement('article');
    card.className = 'plant-card';
    card.innerHTML = `
      <img src="${escapeHtml(item.imagePath || '')}" alt="${escapeHtml(item.name || 'Item')}">
      <h3>${escapeHtml(item.name || 'Untitled')}</h3>
      <p><strong>Category:</strong> ${escapeHtml(category)}</p>
      <p><strong>Bundle:</strong> ${escapeHtml(formatMoney(item.price))} x ${safeQuantity}</p>
      ${category === 'PLANT' && item.size ? `<p><strong>Size:</strong> ${escapeHtml(item.size)}</p>` : ''}
      ${item.care ? `<p><strong>Info:</strong> ${escapeHtml(item.care)}</p>` : ''}
      <p><strong>Subtotal:</strong> ${escapeHtml(formatMoney(itemTotal))}</p>
    `;
    itemsDiv.appendChild(card);
  });

  localStorage.setItem(cartKey, JSON.stringify(validCart));
  sessionStorage.setItem('cart', JSON.stringify(validCart));

  if (!orderItems.length) {
    renderEmptyState(itemsDiv, totalDiv, form, placeOrderButton);
    return;
  }

  totalDiv.textContent = `Total: ${formatMoney(total)}`;

  const savedProfile = getCheckoutProfile();
  const fieldMap = {
    recipientName: document.getElementById('recipientName'),
    phone: document.getElementById('phone'),
    addressLine1: document.getElementById('addressLine1'),
    addressLine2: document.getElementById('addressLine2'),
    city: document.getElementById('city'),
    state: document.getElementById('state'),
    postalCode: document.getElementById('postalCode'),
    landmark: document.getElementById('landmark'),
    deliveryNote: document.getElementById('deliveryNote')
  };

  if (fieldMap.recipientName) fieldMap.recipientName.value = savedProfile.recipientName || me.name || '';
  if (fieldMap.phone) fieldMap.phone.value = savedProfile.phone || '';
  if (fieldMap.addressLine1) fieldMap.addressLine1.value = savedProfile.addressLine1 || '';
  if (fieldMap.addressLine2) fieldMap.addressLine2.value = savedProfile.addressLine2 || '';
  if (fieldMap.city) fieldMap.city.value = savedProfile.city || '';
  if (fieldMap.state) fieldMap.state.value = savedProfile.state || '';
  if (fieldMap.postalCode) fieldMap.postalCode.value = savedProfile.postalCode || '';
  if (fieldMap.landmark) fieldMap.landmark.value = savedProfile.landmark || '';
  if (fieldMap.deliveryNote) fieldMap.deliveryNote.value = savedProfile.deliveryNote || '';

  document.querySelectorAll('input[name="payment"]').forEach((radio) => {
    radio.addEventListener('change', syncPaymentChoices);
  });
  syncPaymentChoices();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (orderStatus) orderStatus.textContent = '';

    const profile = {
      recipientName: String(fieldMap.recipientName?.value || '').trim(),
      phone: normalisePhone(fieldMap.phone?.value),
      addressLine1: String(fieldMap.addressLine1?.value || '').trim(),
      addressLine2: String(fieldMap.addressLine2?.value || '').trim(),
      city: String(fieldMap.city?.value || '').trim(),
      state: String(fieldMap.state?.value || '').trim(),
      postalCode: String(fieldMap.postalCode?.value || '').trim(),
      landmark: String(fieldMap.landmark?.value || '').trim(),
      deliveryNote: String(fieldMap.deliveryNote?.value || '').trim()
    };

    if (!profile.recipientName || !profile.phone || !profile.addressLine1 || !profile.city || !profile.state || !profile.postalCode) {
      ui?.notify({
        title: 'Missing delivery details',
        message: 'Complete the required address fields before placing the order.',
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
      fieldMap.phone?.focus();
      return;
    }

    if (!/^[A-Za-z0-9 -]{4,10}$/.test(profile.postalCode)) {
      ui?.notify({
        title: 'Check the postal code',
        message: 'Use a valid PIN or ZIP code.',
        tone: 'warning'
      });
      fieldMap.postalCode?.focus();
      return;
    }

    saveCheckoutProfile(profile);

    const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value;
    if (!paymentMethod) {
      ui?.notify({
        title: 'Choose a payment method',
        message: 'Select how you want to complete the payment.',
        tone: 'warning'
      });
      return;
    }

    const address = composeAddress(profile);
    const invoicePayload = {
      items: orderItems,
      total,
      paymentMethod: paymentMethod === 'online' ? 'Online' : 'Cash on Delivery',
      address,
      customer: { recipientName: profile.recipientName, phone: profile.phone },
      clearCartOnInvoice: paymentMethod === 'online',
      cartKey
    };

    const orderPayload = {
      email: me.email,
      address,
      cart: validCart,
      payment: invoicePayload.paymentMethod
    };

    placeOrderButton.disabled = true;

    if (paymentMethod === 'online') {
      try {
        const res = await fetch('/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: total,
            name: profile.recipientName,
            email: me.email,
            cart: orderPayload.cart,
            address: orderPayload.address
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.message || 'Could not create payment link.');

        localStorage.setItem('latestOrder', JSON.stringify(invoicePayload));
        ui?.queueNotification({
          title: 'Payment link ready',
          message: 'Complete payment to finish rooting this order.',
          tone: 'success'
        });
        window.location.href = data.short_url;
      } catch (error) {
        console.error('Payment error:', error);
        ui?.notify({
          title: 'Payment link failed',
          message: error.message || 'Could not create payment link.',
          tone: 'error'
        });
        placeOrderButton.disabled = false;
      }
      return;
    }

    try {
      const res = await fetch('/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || 'Order failed.');

      localStorage.setItem('latestOrder', JSON.stringify(invoicePayload));
      localStorage.removeItem(cartKey);
      sessionStorage.removeItem('cart');
      ui?.queueNotification({
        title: 'Order rooted',
        message: 'Your nursery delivery has been scheduled.',
        tone: 'success'
      });
      window.location.href = 'invoice.html';
    } catch (error) {
      console.error('Order error:', error);
      ui?.notify({
        title: 'Order could not be placed',
        message: error.message || 'Something went wrong while placing the order.',
        tone: 'error'
      });
      placeOrderButton.disabled = false;
    }
  });
});
