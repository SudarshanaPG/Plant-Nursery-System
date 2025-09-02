document.addEventListener("DOMContentLoaded", async () => {
  const sellersDiv = document.getElementById("sellersSection");
  const customersDiv = document.getElementById("customersSection");

  const [sellers, customers, plants, sales, pending] = await Promise.all([
    fetch("/data/sellers.json").then(r => r.json()),
    fetch("/data/customers.json").then(r => r.json()),
    fetch("/data/plants.json").then(r => r.json()),
    fetch("/data/sales.json").then(r => r.json()),
    fetch("/data/pending-orders.json").then(r => r.json()),
  ]);

  // SELLER CARDS
  sellers.forEach(seller => {
    const sellerPlants = plants.filter(p => p.sellerName === seller.email);
    const soldItems = [];
    const earnings = [];
    const pendingAmounts = [];

    sales.forEach(entry => {
      if (entry.items) {
        entry.items.forEach(item => {
          if (item.sellerName === seller.email) {
            soldItems.push(item.quantity);
            earnings.push(item.subtotal);
          }
        });
      } else if (entry.plantId) {
        const plant = plants.find(p => p.id === entry.plantId && p.sellerName === seller.email);
        if (plant) {
          soldItems.push(entry.quantity);
          earnings.push(entry.quantity * plant.price);
        }
      }
    });

    pending.forEach(order => {
      for (const pid in order.cart) {
        const plant = plants.find(p => p.id == pid && p.sellerName === seller.email);
        if (plant) {
          pendingAmounts.push(plant.price * order.cart[pid]);
        }
      }
    });

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${seller.photoPath}" alt="Seller Photo" />
      <div class="card-content">
        <div><strong>Name:</strong> ${seller.name}</div>
        <div><strong>Email:</strong> ${seller.email}</div>
        <div><strong>Phone:</strong> ${seller.phone}</div>
        <div><strong>Plants Listed:</strong> ${sellerPlants.length}</div>
        <div><strong>Items Sold:</strong> ${soldItems.reduce((a,b)=>a+b,0)}</div>
        <div><strong>Earnings:</strong> ₹${earnings.reduce((a,b)=>a+b,0)}</div>
        <div><strong>Pending Payout:</strong> ₹${pendingAmounts.reduce((a,b)=>a+b,0)}</div>
      </div>
    `;
    sellersDiv.appendChild(card);
  });

  // CUSTOMER CARDS
  customers.forEach(customer => {
    const orders = sales.filter(s => s.user === customer.email);
    const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${customer.photoPath}" alt="Customer Photo" />
      <div class="card-content">
        <div><strong>Name:</strong> ${customer.name}</div>
        <div><strong>Email:</strong> ${customer.email}</div>
        <div><strong>Phone:</strong> ${customer.phone}</div>
        <div><strong>Orders Placed:</strong> ${orders.length}</div>
        <div><strong>Total Spent:</strong> ₹${totalSpent}</div>
      </div>
    `;
    customersDiv.appendChild(card);
  });

  // ✅ PENDING ORDERS SECTION
  const pendingSection = document.createElement("div");
  pendingSection.className = "card-section";
  pendingSection.innerHTML = `<div class="section-title">🕒 Pending Orders (Verify & Approve)</div>`;
  document.querySelector(".dashboard-container").appendChild(pendingSection);

  pending.forEach((order, index) => {
    const card = document.createElement("div");
    card.className = "card";

    const cartItems = Object.entries(order.cart).map(([pid, qty]) => {
      const plant = plants.find(p => p.id == pid);
      return plant ? `<li>${plant.name} × ${qty} (₹${plant.price * qty})</li>` : "";
    }).join("");

    card.innerHTML = `
      <div class="card-content">
        <div><strong>User:</strong> ${order.user}</div>
        <div><strong>Address:</strong> ${order.address}</div>
        <div><strong>Items:</strong><ul>${cartItems}</ul></div>
        <button class="approve-btn" data-index="${index}">✅ Approve Order</button>
      </div>
    `;
    pendingSection.appendChild(card);
  });

  // ✅ Hook approve buttons
  document.querySelectorAll(".approve-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      const idx = e.target.dataset.index;
      const res = await fetch("/admin/approve-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: parseInt(idx) })
      });
      const result = await res.json();
      if (result.success) {
        alert("✅ Order approved and moved to sales.");
        location.reload();
      } else {
        alert("❌ Error: " + result.message);
      }
    });
  });
});
