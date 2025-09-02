document.addEventListener('DOMContentLoaded', () => {
  const email = localStorage.getItem('loggedInSeller');
  if (!email) {
    alert("Please log in as seller.");
    window.location.href = 'seller.html';
    return;
  }

  fetch(`/api/my-dashboard?email=${encodeURIComponent(email)}`)
    .then(res => res.json())
    .then(plants => {
      const container = document.getElementById('dashboardContainer');

      if (plants.length === 0) {
        container.innerHTML = "<p style='text-align:center;'>You haven't listed any plants yet.</p>";
        return;
      }

      plants.forEach(p => {
        const div = document.createElement('div');
        div.className = 'plant-card';
        div.innerHTML = `
          <img src="${p.imagePath}" alt="${p.name}">
          <h3>${p.name}</h3>
          <p><strong>Size:</strong> ${p.size}</p>
          <p><strong>Price:</strong> ₹${p.price}</p>
          <p><strong>Booked:</strong> ${p.booked}</p>
          <p><strong>Profit:</strong> ${p.profit === "--" ? "--" : `₹${p.profit}`}</p>
          <p><strong>Stock:</strong> <span id="stock-${p.name}">${p.stock}</span></p>

          <label>Add More Stock:</label>
          <input type="number" min="1" class="stock-input" id="add-${p.name}" placeholder="Enter quantity" style="width:100%; padding:5px;">
          <button class="cta-button" data-id="${p.id}" data-stock="${p.stock}" data-name="${p.name}">Update Stock</button>
        `;
        container.appendChild(div);
      });

      // Attach update handlers
      document.querySelectorAll(".cta-button").forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute("data-id");
          const currentStock = parseInt(btn.getAttribute("data-stock"));
          const name = btn.getAttribute("data-name");
          const input = document.getElementById(`add-${name}`);
          const addAmount = parseInt(input.value);

          if (!addAmount || addAmount < 1) {
            alert("Please enter a valid amount to add.");
            return;
          }

          const newStock = currentStock + addAmount;

          fetch(`/api/update-plant/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stock: newStock })
          })
            .then(res => res.json())
            .then(data => {
              if (data.success) {
                alert("✅ Stock updated successfully.");
                document.getElementById(`stock-${name}`).textContent = newStock;
                input.value = "";
                btn.setAttribute("data-stock", newStock); // update button attribute
              } else {
                alert("❌ Failed to update stock.");
              }
            })
            .catch(err => {
              console.error(err);
              alert("❌ Error updating stock.");
            });
        };
      });
    })
    .catch(err => {
      console.error(err);
      document.getElementById('dashboardContainer').textContent = 'Error loading dashboard.';
    });
});
