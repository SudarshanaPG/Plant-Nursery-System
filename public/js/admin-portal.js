document.addEventListener('DOMContentLoaded', async () => {
  const status = document.getElementById('adminStatus');
  const setStatus = (msg) => {
    if (status) status.textContent = msg || '';
  };

  try {
    const res = await fetch('/api/me', { cache: 'no-store' });
    const data = await res.json();
    const user = data?.user || null;

    if (!user) return;
    if (user.role === 'ADMIN') {
      window.location.href = 'admin-dashboard.html';
      return;
    }

    setStatus(`Signed in as ${user.email}. This account is not an admin.`);
  } catch {
    // ignore
  }
});

