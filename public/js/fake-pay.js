document.addEventListener('DOMContentLoaded', () => {
  const ui = window.GreenLeafUI;
  const params = new URLSearchParams(window.location.search);
  const paymentLinkId = params.get('pl') || '';
  const token = params.get('token') || '';

  const refEl = document.getElementById('payRef');
  const errorEl = document.getElementById('payError');
  const payBtn = document.getElementById('payBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  if (refEl) refEl.textContent = paymentLinkId ? `Reference: ${paymentLinkId}` : '';

  const fail = (message) => {
    if (errorEl) errorEl.textContent = message || 'Something went wrong.';
    ui?.notify({
      title: 'Payment not completed',
      message: message || 'Something went wrong.',
      tone: 'error'
    });
  };

  cancelBtn?.addEventListener('click', () => {
    window.location.href = 'plants.html';
  });

  payBtn?.addEventListener('click', async () => {
    if (errorEl) errorEl.textContent = '';

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

      ui?.queueNotification({
        title: 'Payment confirmed',
        message: 'Your order has been paid and the invoice is ready.',
        tone: 'success'
      });
      window.location.href = 'invoice.html';
    } catch (error) {
      console.error(error);
      fail('Payment failed.');
      payBtn.disabled = false;
      payBtn.textContent = 'Pay Now (Simulate)';
    }
  });
});
