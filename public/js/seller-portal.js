document.addEventListener('DOMContentLoaded', async () => {
  const logoutLink = document.getElementById('sellerLogout');
  if (logoutLink) {
    logoutLink.onclick = async (e) => {
      e.preventDefault();
      try {
        await fetch('/logout', { method: 'POST' });
      } catch {}
      window.location.href = '/';
    };
  }

  const status = document.getElementById('sellerStatus');
  const setStatus = (msg) => {
    if (status) status.textContent = msg || '';
  };

  try {
    const res = await fetch('/api/me', { cache: 'no-store' });
    const data = await res.json();
    const user = data?.user || null;

    if (!user) return;
    if (user.role === 'SELLER') {
      window.location.href = 'seller-dashboard.html';
      return;
    }

    setStatus(`Signed in as ${user.email}. This account is not a seller yet.`);
  } catch {
    // ignore
  }
});
