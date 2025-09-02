document.addEventListener('DOMContentLoaded', () => {
  const email = localStorage.getItem('loggedInSeller');
  const sellers = JSON.parse(localStorage.getItem('sellers') || '[]');
  const seller = sellers.find(s => s.email === email);
  const sellerName = seller?.name || "Unknown";

  const form = document.getElementById('plantForm');
  if (form) {
    form.onsubmit = function (e) {
      e.preventDefault();

      const widthValue = form.elements['widthValue'].value;
      const widthUnit = form.elements['widthUnit'].value;
      const heightValue = form.elements['heightValue'].value;
      const heightUnit = form.elements['heightUnit'].value;
      const size = `Width: ${widthValue} ${widthUnit}, Height: ${heightValue} ${heightUnit}`;

      const formData = new FormData(form);
      formData.set('size', size);
      formData.append('sellerEmail', email);
      formData.append('sellerName', sellerName);

      fetch('/upload-plant', {
        method: 'POST',
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        const status = document.getElementById('plantStatus');
        if (data.success) {
          status.textContent = '✅ Plant uploaded successfully!';
          form.reset();
        } else {
          status.textContent = `❌ Error: ${data.message || 'Something went wrong'}`;
        }
      })
      .catch(err => {
        console.error(err);
        document.getElementById('plantStatus').textContent = '❌ Upload failed';
      });
    };
  }
});
