document.addEventListener("DOMContentLoaded", () => {
  fetch('/data/plants.json?ts=' + Date.now())
    .then(response => {
      if (!response.ok) throw new Error("Network response was not ok");
      return response.json();
    })
    .then(plants => {
      const container = document.getElementById("plants-container");
      if (!container) return alert("❌ Missing container!");

      container.innerHTML = "";

      plants.forEach(plant => {
        const card = document.createElement("div");
        card.className = "plant-card";

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

      // ✅ FIXED: ID passed via URL query string
      document.querySelectorAll(".book-now").forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute("data-id");
          const user = localStorage.getItem("loggedInUser");
          if (!user) {
            alert("Please log in to book a plant.");
            return window.location.href = "user-login.html";
          }
          window.location.href = `plant-detail.html?id=${id}`;
        };
      });

      document.querySelectorAll(".add-to-cart").forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute("data-id");
          const user = localStorage.getItem("loggedInUser");
          if (!user) {
            alert("Please log in to add to cart.");
            return window.location.href = "user-login.html";
          }

          const cartKey = `cart_${user}`;
          const cart = JSON.parse(localStorage.getItem(cartKey) || "{}");
          cart[id] = (cart[id] || 0) + 1;
          localStorage.setItem(cartKey, JSON.stringify(cart));

          alert("✅ Added to cart!");
        };
      });
    })
    .catch(error => {
      console.error("❌ Error loading plants:", error);
      const container = document.getElementById("plants-container");
      if (container) container.innerHTML = "<p>⚠️ Could not load plants.</p>";
    });
});
