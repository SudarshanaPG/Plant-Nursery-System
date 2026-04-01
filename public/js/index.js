window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('user-action-btn');
  const sellerEntryLink = document.getElementById('heroSellerLink');
  if (!container) return;

  const setSellerEntryVisibility = (visible) => {
    if (!sellerEntryLink) return;
    sellerEntryLink.hidden = !visible;
    sellerEntryLink.setAttribute('aria-hidden', String(!visible));
  };

  const createButton = ({ text, href, kind = 'primary', onClick }) => {
    const button = document.createElement('a');
    button.className = `cta-button${kind === 'secondary' ? ' secondary' : ''}${
      kind === 'danger' ? ' danger' : ''
    }`;
    button.textContent = text;
    button.href = href || '#';
    if (onClick) {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        await onClick();
      });
    }
    return button;
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

  const logout = async () => {
    try {
      await fetch('/logout', { method: 'POST' });
    } catch {
      // ignore logout failures
    }
    localStorage.removeItem('loggedInUser');
    window.location.href = '/';
  };

  container.innerHTML = '';

  if (!user) {
    setSellerEntryVisibility(true);
    container.appendChild(
      createButton({ text: 'Continue with Google', href: '/auth/google?next=/', kind: 'secondary' })
    );
    return;
  }

  if (user.role === 'SELLER') {
    setSellerEntryVisibility(false);
    container.appendChild(createButton({ text: 'Seller Dashboard', href: 'seller-dashboard.html' }));
    container.appendChild(createButton({ text: 'Browse Catalog', href: 'plants.html', kind: 'secondary' }));
    container.appendChild(createButton({ text: 'Logout', href: '#', kind: 'danger', onClick: logout }));
    return;
  }

  setSellerEntryVisibility(true);
  container.appendChild(createButton({ text: 'My Cart', href: 'cart.html', kind: 'secondary' }));
  container.appendChild(createButton({ text: 'Logout', href: '#', kind: 'danger', onClick: logout }));
});
