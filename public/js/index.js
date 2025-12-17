// js/index.js

window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('user-action-btn');
  if (!container) return;

  let user = null;
  try {
    const res = await fetch('/api/me', { cache: 'no-store' });
    const data = await res.json();
    user = data.user || null;
    if (user?.email) localStorage.setItem('loggedInUser', user.email);
  } catch {
    user = null;
  }

  if (user?.role === 'ADMIN') {
    window.location.href = 'admin-dashboard.html';
    return;
  }

  const btn = document.createElement('a');
  btn.className = 'cta-button secondary';

  if (user) {
    btn.textContent = 'Logout';
    btn.href = '#';
    btn.onclick = async () => {
      try {
        await fetch('/logout', { method: 'POST' });
      } catch {}
      localStorage.removeItem('loggedInUser');
      alert('Logged out successfully.');
      location.reload();
    };
  } else {
    btn.textContent = 'Continue with Google';
    btn.href = '/auth/google?next=/plants.html';
  }

  container.appendChild(btn);
});
