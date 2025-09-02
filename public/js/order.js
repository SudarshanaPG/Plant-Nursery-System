document.addEventListener("DOMContentLoaded", () => {
  const itemsDiv = document.getElementById("items");
  const totalDiv = document.getElementById("total");

  const cart = JSON.parse(sessionStorage.getItem("cart") || "{}"); // ✅ Fix: was localStorage
  const plants = JSON.parse(localStorage.getItem("plants") || "[]");

  let total = 0;
  let hasItems = false;

  for (let id in cart) {
    const plant = plants.find(p => p.id == id);
    if (plant) {
      hasItems = true;
      const quantity = cart[id];
      const itemTotal = quantity * plant.price;
      total += itemTotal;

      const card = document.createElement("div");
      card.className = "plant-card";
      card.innerHTML = `
        <img src="${plant.imagePath}" alt="${plant.name}">
        <h3>${plant.name}</h3>
        <p><strong>Price:</strong> ₹${plant.price} × ${quantity} = ₹${itemTotal}</p>
        <p><strong>Size:</strong> ${plant.size}</p>
        <p><strong>Care Instructions:</strong> ${plant.care}</p>
        <p><strong>Available Stock:</strong> ${plant.stock}</p>
      `;
      itemsDiv.appendChild(card);
    }
  }

  if (!hasItems) {
    itemsDiv.innerHTML = `<p style="color:red;">❌ No items to confirm.</p>`;
  }

  totalDiv.innerText = `Total: ₹${total}`;

  document.getElementById("place-order").addEventListener("click", async () => {
    const address = document.getElementById("address").value;
    const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
    const user = localStorage.getItem("loggedInCustomer") || "Guest";

    if (!address) return alert("Please enter a shipping address.");

    const orderPayload = {
      user,
      address,
      cart,
      payment: paymentMethod === "cod" ? "Cash on Delivery" : "Online"
    };

    if (paymentMethod === "online") {
      const email = prompt("Please enter your email:");
      if (!email || !email.includes("@")) return alert("❌ Invalid email address.");
      try {
        const res = await fetch("/create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...orderPayload, amount: total, email })
        });
        const data = await res.json();
        if (data.success) {
          localStorage.removeItem("cart");
          window.location.href = data.short_url;
        } else {
          alert("❌ Could not create payment link.");
        }
      } catch (err) {
        console.error("❌ Payment error:", err);
        alert("❌ Payment error");
      }
    } else {
      const res = await fetch("/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload)
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ Order placed successfully!");
        localStorage.removeItem("cart");
        window.location.href = "invoice.html";
      } else {
        alert("❌ Order failed: " + data.message);
      }
    }
  });
});
