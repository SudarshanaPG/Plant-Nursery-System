document.addEventListener('DOMContentLoaded', async () => {
  const logoutLink = document.getElementById('sellerLogout');
  if (logoutLink) {
    logoutLink.onclick = async (e) => {
      e.preventDefault();
      try {
        await fetch('/logout', { method: 'POST' });
      } catch {}
      window.location.href = '/';
    };
  }

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

  const categorySelect = document.getElementById('category');
  const plantSizeFields = document.getElementById('plantSizeFields');
  const careLabel = document.getElementById('careLabel');
  const careInput = document.getElementById('care');

  const setPlantSizingEnabled = (enabled) => {
    if (plantSizeFields) plantSizeFields.style.display = enabled ? 'block' : 'none';
    const widthValue = form.elements['widthValue'];
    const widthUnit = form.elements['widthUnit'];
    const heightValue = form.elements['heightValue'];
    const heightUnit = form.elements['heightUnit'];
    [widthValue, widthUnit, heightValue, heightUnit].forEach((el) => {
      if (!el) return;
      el.required = Boolean(enabled);
      if (!enabled) el.value = '';
    });
  };

  const applyCategoryCopy = (category) => {
    const normalized = String(category || 'PLANT').toUpperCase();
    if (normalized === 'PLANT') {
      if (careLabel) careLabel.textContent = 'Care / Maintenance Instructions:';
      if (careInput) careInput.placeholder = 'e.g. Watering schedule, sunlight needs, manure/fertilizer timing...';
      setPlantSizingEnabled(true);
      return;
    }
    if (normalized === 'CHEMICAL') {
      if (careLabel) careLabel.textContent = 'Usage Instructions:';
      if (careInput) careInput.placeholder = 'e.g. How to use, dosage, safety precautions, frequency...';
      setPlantSizingEnabled(false);
      return;
    }
    if (normalized === 'TOOL') {
      if (careLabel) careLabel.textContent = 'How to Use:';
      if (careInput) careInput.placeholder = 'e.g. Usage steps, care/maintenance, safety tips...';
      setPlantSizingEnabled(false);
      return;
    }
    setPlantSizingEnabled(false);
  };

  if (categorySelect) {
    categorySelect.onchange = () => applyCategoryCopy(categorySelect.value);
    applyCategoryCopy(categorySelect.value);
  } else {
    applyCategoryCopy('PLANT');
  }

  form.onsubmit = function (e) {
    e.preventDefault();

    const formData = new FormData(form);
    const category = String(formData.get('category') || 'PLANT').toUpperCase();

    if (category === 'PLANT') {
      const widthValue = String(form.elements['widthValue']?.value || '').trim();
      const widthUnit = String(form.elements['widthUnit']?.value || '').trim();
      const heightValue = String(form.elements['heightValue']?.value || '').trim();
      const heightUnit = String(form.elements['heightUnit']?.value || '').trim();
      const size = `Width: ${widthValue} ${widthUnit}, Height: ${heightValue} ${heightUnit}`;
      formData.set('size', size);
    } else {
      formData.delete('size');
    }

    fetch('/upload-plant', {
      method: 'POST',
      body: formData
    })
      .then((res) => res.json())
      .then((data) => {
        const status = document.getElementById('plantStatus');
        if (status) status.style.color = data.success ? 'green' : 'crimson';
        if (data.success) {
          if (status) status.textContent = 'Listing created successfully.';
          form.reset();
          if (categorySelect) applyCategoryCopy(categorySelect.value);
        } else {
          if (status) status.textContent = `Error: ${data.message || 'Something went wrong'}`;
        }
      })
      .catch((err) => {
        console.error(err);
        const status = document.getElementById('plantStatus');
        if (status) {
          status.style.color = 'crimson';
          status.textContent = 'Upload failed';
        }
      });
  };
});
