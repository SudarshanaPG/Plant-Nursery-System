// js/index.js

window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("user-action-btn");
  const user = localStorage.getItem("loggedInUser");

  const btn = document.createElement("a");
  btn.className = "cta-button secondary";

  if (user) {
    btn.textContent = "Logout";
    btn.href = "#";
    btn.onclick = () => {
      localStorage.removeItem("loggedInUser"); // ✅ Only remove login info
      alert("👋 Logged out successfully.");
      location.reload();
    };

  } else {
    btn.textContent = "Login";
    btn.href = "user-login.html";
  }

  container.appendChild(btn);
});
