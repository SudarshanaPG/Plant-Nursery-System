// js/index.js

window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('user-action-btn');
  if (!container) return;

  const createButton = ({ text, href, kind = 'primary', onClick }) => {
    const btn = document.createElement('a');
    btn.className = `cta-button${kind === 'secondary' ? ' secondary' : ''}${
      kind === 'danger' ? ' danger' : ''
    }`;
    btn.textContent = text;
    btn.href = href || '#';
    if (onClick) {
      btn.onclick = async (e) => {
        e.preventDefault();
        await onClick();
      };
    }
    return btn;
  };

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

  container.innerHTML = '';

  const logout = async () => {
    try {
      await fetch('/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('loggedInUser');
    window.location.href = '/';
  };

  if (!user) {
    container.appendChild(
      createButton({ text: 'Continue with Google', href: '/auth/google?next=/', kind: 'secondary' })
    );
    return;
  }

  if (user.role === 'SELLER') {
    container.appendChild(createButton({ text: 'Seller Dashboard', href: 'seller-dashboard.html' }));
    container.appendChild(createButton({ text: 'Shop', href: 'plants.html', kind: 'secondary' }));
    container.appendChild(createButton({ text: 'Logout', href: '#', kind: 'danger', onClick: logout }));
    return;
  }

  container.appendChild(createButton({ text: 'Logout', href: '#', kind: 'danger', onClick: logout }));
});
