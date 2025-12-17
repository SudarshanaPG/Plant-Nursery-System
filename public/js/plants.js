document.addEventListener('DOMContentLoaded', async () => {
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
    window.location.href = `/auth/google?next=${encodeURIComponent('/plants.html')}`;
    return;
  }

  fetch('/data/plants.json?ts=' + Date.now())
    .then((response) => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    })
    .then((plants) => {
      const container = document.getElementById('plants-container');
      if (!container) return alert('Something went wrong loading the page. Please refresh.');

      container.innerHTML = '';

      plants.forEach((plant) => {
        const card = document.createElement('div');
        card.className = 'plant-card';

        card.innerHTML = `
          <img src="${plant.imagePath}" alt="${plant.name}" />
          <h3>${plant.name}</h3>
          <p><strong>Price:</strong> ₹${plant.price}</p>
          <p><strong>Stock:</strong> ${plant.stock}</p>
          <button class="book-now" data-id="${plant.id}">Book Now</button>
          <button class="add-to-cart" data-id="${plant.id}">Add to Cart</button>
        `;

        container.appendChild(card);
      });

      document.querySelectorAll('.book-now').forEach((btn) => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-id');
          if (!me) {
            window.location.href = `/auth/google?next=${encodeURIComponent(`/plant-detail.html?id=${id}`)}`;
            return;
          }
          window.location.href = `plant-detail.html?id=${id}`;
        };
      });

      document.querySelectorAll('.add-to-cart').forEach((btn) => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-id');
          if (!me) {
            window.location.href = `/auth/google?next=${encodeURIComponent('/plants.html')}`;
            return;
          }

          const cartKey = `cart_${me.email}`;
          const cart = JSON.parse(localStorage.getItem(cartKey) || '{}');
          cart[id] = (cart[id] || 0) + 1;
          localStorage.setItem(cartKey, JSON.stringify(cart));

          alert('Added to cart.');
        };
      });
    })
    .catch((error) => {
      console.error('Error loading plants:', error);
      const container = document.getElementById('plants-container');
      if (container) container.innerHTML = '<p>Could not load plants.</p>';
    });
});
