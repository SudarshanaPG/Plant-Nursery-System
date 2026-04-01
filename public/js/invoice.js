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

const withBreaks = (value) => escapeHtml(value).replaceAll('\n', '<br>');

document.addEventListener('DOMContentLoaded', () => {
  const invoiceDiv = document.getElementById('invoice');
  if (!invoiceDiv) return;

  let order = null;
  try {
    order = JSON.parse(localStorage.getItem('latestOrder') || 'null');
  } catch {
    order = null;
  }

  if (!order || !Array.isArray(order.items) || !order.items.length) {
    invoiceDiv.innerHTML = `
      <div class="empty-state">
        <p>No recent order was found.</p>
        <a href="plants.html" class="cta-button secondary">Browse plants</a>
      </div>
    `;
    return;
  }

  const orderId = order.id || `ORD${Date.now().toString().slice(-6)}`;
  const timestamp = order.timestamp || new Date().toISOString();
  const nextOrderState = { ...order, id: orderId, timestamp };
  localStorage.setItem('latestOrder', JSON.stringify(nextOrderState));

  if (order.clearCartOnInvoice && order.cartKey) {
    localStorage.removeItem(order.cartKey);
    sessionStorage.removeItem('cart');
  }

  const itemLines = order.items
    .map(
      (item) => `
        <div class="invoice-line">
          <p><strong>${escapeHtml(item.name)}</strong></p>
          <p>${escapeHtml(formatMoney(item.price))} x ${escapeHtml(String(item.quantity))}</p>
          <p><strong>Line total:</strong> ${escapeHtml(
            formatMoney(Number(item.price || 0) * Number(item.quantity || 0))
          )}</p>
        </div>
      `
    )
    .join('');

  invoiceDiv.innerHTML = `
    <div class="invoice-box">
      <span class="section-eyebrow">Order rooted</span>
      <h2>GreenLeaf Nursery</h2>
      <hr>
      <p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>
      <p><strong>Date:</strong> ${escapeHtml(new Date(timestamp).toLocaleString())}</p>
      <p><strong>Recipient:</strong> ${escapeHtml(order.customer?.recipientName || 'Customer')}</p>
      <p><strong>Contact:</strong> ${escapeHtml(order.customer?.phone || 'Not provided')}</p>
      <p><strong>Shipping address:</strong><br>${withBreaks(order.address || 'Not provided')}</p>
      <p><strong>Payment method:</strong> ${escapeHtml(order.paymentMethod || 'Unknown')}</p>
      <hr>
      ${itemLines}
      <hr>
      <p><strong>Total:</strong> ${escapeHtml(formatMoney(order.total || 0))}</p>
      <p style="text-align:center; margin-top: 20px;">Thank you for shopping with GreenLeaf Nursery.</p>
    </div>
  `;

  document.getElementById('downloadBtn')?.addEventListener('click', () => {
    window.print();
  });
});
