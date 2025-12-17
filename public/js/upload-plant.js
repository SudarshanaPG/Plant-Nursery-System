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

  const form = document.getElementById('plantForm');
  if (!form) return;

  form.onsubmit = function (e) {
    e.preventDefault();

    const widthValue = form.elements['widthValue'].value;
    const widthUnit = form.elements['widthUnit'].value;
    const heightValue = form.elements['heightValue'].value;
    const heightUnit = form.elements['heightUnit'].value;
    const size = `Width: ${widthValue} ${widthUnit}, Height: ${heightValue} ${heightUnit}`;

    const formData = new FormData(form);
    formData.set('size', size);

    fetch('/upload-plant', {
      method: 'POST',
      body: formData
    })
      .then((res) => res.json())
      .then((data) => {
        const status = document.getElementById('plantStatus');
        if (data.success) {
          status.textContent = 'Plant uploaded successfully.';
          form.reset();
        } else {
          status.textContent = `Error: ${data.message || 'Something went wrong'}`;
        }
      })
      .catch((err) => {
        console.error(err);
        document.getElementById('plantStatus').textContent = 'Upload failed';
      });
  };
});
