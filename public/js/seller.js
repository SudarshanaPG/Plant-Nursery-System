localStorage.removeItem('sellers');
localStorage.removeItem('loggedInSeller');

const authSection = document.getElementById('authSection');

// ---------------------
// Render Login Form
// ---------------------
function renderAuth() {
  authSection.innerHTML = `
    <h2>Seller Login</h2>
    <form id="loginForm">
      <input type="email" id="email" placeholder="Email" required>
      <input type="password" id="pwd" placeholder="Password" required>
      <button type="submit" class="cta-button">Login</button>
      <button type="button" id="showRegister" class="cta-button secondary">Register</button>
      <p id="authError" style="color:red;"></p>
    </form>
  `;

  document.getElementById('showRegister').onclick = renderRegister;
  document.getElementById('loginForm').onsubmit = loginSeller;
}

// ---------------------
// Render Registration Form
// ---------------------
function renderRegister() {
  authSection.innerHTML = `
  <h2>Seller Registration</h2>
  <form id="registerForm" enctype="multipart/form-data">
    <input type="text" id="regName" placeholder="Your Name" required>
    <input type="email" id="regEmail" placeholder="Email" required>
    <input type="password" id="regPwd" placeholder="Password" required>
    <input type="text" id="regPhone" placeholder="Phone Number" required>
    <label for="regPhoto">Upload Profile Photo:</label>
    <input type="file" id="regPhoto" accept="image/*" required title="Upload your profile photo (JPEG, PNG)">
    <button type="submit" class="cta-button">Register</button>
    <button type="button" id="showLogin" class="cta-button secondary">Login Instead</button>
    <p id="authError" style="color:red;"></p>
  </form>
  `;


  document.getElementById('showLogin').onclick = renderAuth;
  document.getElementById('registerForm').onsubmit = registerSeller;
}

// ---------------------
// Seller Registration
// ---------------------
function registerSeller(e) {
  e.preventDefault();

  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pwd = document.getElementById('regPwd').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const photoFile = document.getElementById('regPhoto').files[0];

  const formData = new FormData();
  formData.append('name', name);
  formData.append('email', email);
  formData.append('password', pwd);
  formData.append('phone', phone);
  if (photoFile) {
    formData.append('photo', photoFile);
  }

  fetch('/register-seller', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert("✅ Registration successful. Please log in.");
      renderAuth();
    } else {
      document.getElementById('authError').textContent = '❌ ' + data.message;
    }
  })
  .catch(err => {
    console.error(err);
    document.getElementById('authError').textContent = '❌ Registration failed.';
  });
}

// ---------------------
// Seller Login
// ---------------------
function loginSeller(e) {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const pwd = document.getElementById('pwd').value.trim();

  fetch('/login-seller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: pwd
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      localStorage.setItem('loggedInSeller', email);
      window.location.href = "seller-dashboard.html";
    } else {
      document.getElementById('authError').textContent = '❌ ' + data.message;
    }
  })
  .catch(err => {
    console.error(err);
    document.getElementById('authError').textContent = '❌ Login failed.';
  });
}

// ---------------------
// Init View
// ---------------------
(function init() {
  renderAuth();
})();
