document.addEventListener('DOMContentLoaded', async () => {
  let me = null;
  try {
    const res = await fetch('/api/me', { cache: 'no-store' });
    const data = await res.json();
    me = data.user || null;
  } catch {
    me = null;
  }

  if (!me || me.role !== 'SELLER') {
    alert('Please log in as seller.');
    window.location.href = 'seller.html';
    return;
  }

  fetch('/api/my-dashboard')
    .then((res) => res.json())
    .then((plants) => {
      const container = document.getElementById('dashboardContainer');

      if (plants.length === 0) {
        container.innerHTML = "<p style='text-align:center;'>You haven't listed any plants yet.</p>";
        return;
      }

      plants.forEach((p) => {
        const div = document.createElement('div');
        div.className = 'plant-card';
        div.innerHTML = `
          <img src="${p.imagePath}" alt="${p.name}">
          <h3>${p.name}</h3>
          <p><strong>Size:</strong> ${p.size}</p>
          <p><strong>Price:</strong> ₹${p.price}</p>
          <p><strong>Booked:</strong> ${p.booked}</p>
          <p><strong>Profit:</strong> ${p.profit === "--" ? "--" : `₹${p.profit}`}</p>
          <p><strong>Stock:</strong> <span id="stock-${p.id}">${p.stock}</span></p>

          <label>Add More Stock:</label>
          <input type="number" min="1" class="stock-input" id="add-${p.id}" placeholder="Enter quantity" style="width:100%; padding:5px;">
          <button class="cta-button" data-id="${p.id}" data-stock="${p.stock}">Update Stock</button>
        `;
        container.appendChild(div);
      });

      // Attach update handlers
      document.querySelectorAll('.cta-button').forEach((btn) => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-id');
          const currentStock = parseInt(btn.getAttribute('data-stock'), 10) || 0;
          const input = document.getElementById(`add-${id}`);
          if (!input) return;
          const addAmount = parseInt(input.value, 10);

          if (!addAmount || addAmount < 1) {
            alert('Please enter a valid amount to add.');
            return;
          }

          const newStock = currentStock + addAmount;

          fetch(`/api/update-plant/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock: newStock })
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                alert('Stock updated successfully.');
                document.getElementById(`stock-${id}`).textContent = newStock;
                input.value = '';
                btn.setAttribute('data-stock', newStock);
              } else {
                alert('Failed to update stock.');
              }
            })
            .catch((err) => {
              console.error(err);
              alert('Error updating stock.');
            });
        };
      });
    })
    .catch((err) => {
      console.error(err);
      document.getElementById('dashboardContainer').textContent = 'Error loading dashboard.';
    });
});
