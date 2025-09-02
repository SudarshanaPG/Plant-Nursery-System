// js/user-register.js

document.getElementById("registerForm").onsubmit = function (e) {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const photoFile = document.getElementById("photo").files[0];

  const formData = new FormData();
  formData.append("name", name);
  formData.append("email", email);
  formData.append("password", password);
  formData.append("phone", phone);
  if (photoFile) {
    formData.append("photo", photoFile);
  }

  fetch("/register-user", {
    method: "POST",
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert("✅ Registration successful. Please login.");
      window.location.href = "user-login.html";
    } else {
      document.getElementById("registerError").textContent = data.message;
    }
  })
  .catch(err => {
    console.error("Registration failed:", err);
    document.getElementById("registerError").textContent = "Something went wrong. Please try again.";
  });
};
