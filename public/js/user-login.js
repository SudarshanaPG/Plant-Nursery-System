// js/user-login.js
document.getElementById("loginForm").onsubmit = function (e) {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  fetch("/login-user", {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      localStorage.setItem("loggedInUser", email);
      window.location.href = "plants.html";
    } else {
      document.getElementById("loginError").textContent = data.message;
    }
  })
  .catch(err => {
    console.error("Login failed:", err);
    document.getElementById("loginError").textContent = "Something went wrong. Please try again.";
  });

};
