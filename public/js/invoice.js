document.addEventListener('DOMContentLoaded', () => {
  const invoiceDiv = document.getElementById('invoice');
  const order = JSON.parse(localStorage.getItem('latestOrder'));

  if (!order || !order.items || order.items.length === 0) {
    invoiceDiv.innerHTML = `<p style="text-align:center;">❌ No recent order found.</p>`;
    return;
  }

  // Generate an order ID and timestamp if not already included
  const orderId = order.id || `ORD${Date.now().toString().slice(-6)}`;
  const timestamp = order.timestamp || new Date().toISOString();

  // Update the localStorage (optional, in case invoice.html is refreshed)
  localStorage.setItem('latestOrder', JSON.stringify({
    ...order,
    id: orderId,
    timestamp
  }));

  let html = `
    <div class="invoice-box">
      <h2 style="text-align:center;">GreenLeaf Nursery</h2>
      <hr>
      <div style="padding: 10px;">
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Date:</strong> ${new Date(timestamp).toLocaleString()}</p>
        <p><strong>Shipping Address:</strong> ${order.address}</p>
        <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
        <hr>
        ${order.items.map(item => `
          <p><strong>Plant Name:</strong> ${item.name}</p>
          <p>Price: ₹${item.price} × ${item.quantity} = ₹${item.price * item.quantity}</p>
          <hr>
        `).join('')}
        <p><strong>Total Paid:</strong> ₹${order.total}</p>
      </div>
      <p style="text-align:center; margin-top: 20px;">🌱 Thank you for shopping with GreenLeaf Nursery!</p>
    </div>
  `;

  invoiceDiv.innerHTML = html;

  document.getElementById('downloadBtn')?.addEventListener('click', () => {
    window.print();
  });
});
