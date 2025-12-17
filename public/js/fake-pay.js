document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const paymentLinkId = params.get('pl') || '';
  const token = params.get('token') || '';

  const refEl = document.getElementById('payRef');
  const errorEl = document.getElementById('payError');
  const payBtn = document.getElementById('payBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  if (refEl) refEl.textContent = paymentLinkId ? `Reference: ${paymentLinkId}` : '';

  const fail = (msg) => {
    if (errorEl) errorEl.textContent = msg || 'Something went wrong.';
  };

  cancelBtn?.addEventListener('click', () => {
    window.location.href = 'plants.html';
  });

  payBtn?.addEventListener('click', async () => {
    errorEl.textContent = '';

    if (!paymentLinkId || !token) {
      fail('Missing payment reference.');
      return;
    }

    payBtn.disabled = true;
    payBtn.textContent = 'Processing...';

    try {
      const res = await fetch('/api/fake-payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentLinkId, token })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        fail(data.message || 'Payment failed.');
        payBtn.disabled = false;
        payBtn.textContent = 'Pay Now (Simulate)';
        return;
      }

      window.location.href = 'invoice.html';
    } catch (err) {
      console.error(err);
      fail('Payment failed.');
      payBtn.disabled = false;
      payBtn.textContent = 'Pay Now (Simulate)';
    }
  });
});

