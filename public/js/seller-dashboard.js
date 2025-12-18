const formatMoney = (value) => {
  const numberValue = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(numberValue);
  } catch {
    return `INR ${numberValue.toFixed(2)}`;
  }
};

const categoryLabel = (category) => {
  const value = String(category || 'PLANT').toUpperCase();
  if (value === 'CHEMICAL') return 'Chemicals & Manure';
  if (value === 'TOOL') return 'Tools';
  return 'Plants';
};

const fetchJson = async (url, options) => {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message = json?.message || json?.error || res.statusText || 'Request failed';
    throw new Error(message);
  }
  return json;
};

const renderSummary = (summary) => {
  const el = document.getElementById('sellerSummary');
  if (!el) return;

  const grossSales = Number(summary?.grossSales || 0);
  const sellerPayout = Number(summary?.sellerPayout || 0);
  const platformFee = Number(summary?.platformFee || 0);
  const unitsSold = Number(summary?.unitsSold || 0);

  el.innerHTML = `
    <div class="card-section">
      <div class="section-title">Sales Summary</div>
      <div class="card">
        <div class="card-content">
          <div><strong>Gross Sales:</strong> ${formatMoney(grossSales)}</div>
          <div><strong>Units Sold:</strong> ${unitsSold}</div>
          <div><strong>Your Payout (80%):</strong> ${formatMoney(sellerPayout)}</div>
          <div><strong>Platform Fee (20%):</strong> ${formatMoney(platformFee)}</div>
        </div>
      </div>
    </div>
  `;
};

const createThumb = ({ url, onRemove }) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'thumb';

  const img = document.createElement('img');
  img.src = url;
  img.alt = 'Photo';
  wrapper.appendChild(img);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '×';
  btn.title = 'Remove photo';
  btn.onclick = onRemove;
  wrapper.appendChild(btn);

  return wrapper;
};

const buildProductCard = (product, { onUpdated, onDeleted, setError }) => {
  const card = document.createElement('div');
  card.className = 'plant-card';

  const mainImgUrl = product.imagePath || product.imageUrls?.[0] || '';
  const category = String(product.category || 'PLANT').toUpperCase();

  card.innerHTML = `
    <img src="${mainImgUrl}" alt="${product.name || 'Listing'}">
    <h3>${product.name}</h3>
    <p><strong>Category:</strong> ${categoryLabel(category)}</p>
    ${category === 'PLANT' ? `<p><strong>Size:</strong> ${product.size || '--'}</p>` : ''}
    <p><strong>Price:</strong> ${formatMoney(product.price)}</p>
    <p><strong>Stock:</strong> <span data-stock>${product.stock}</span></p>
    <p><strong>Sold (PAID/FULFILLED):</strong> <span data-sold>${product.soldUnits || 0}</span></p>
    <p><strong>Your Payout:</strong> <span data-payout>${formatMoney(product.sellerPayout || 0)}</span></p>
  `;

  const thumbRow = document.createElement('div');
  thumbRow.className = 'thumb-row';
  card.appendChild(thumbRow);

  const renderThumbs = () => {
    thumbRow.innerHTML = '';
    const urls = Array.isArray(product.imageUrls) ? product.imageUrls : [];
    urls.forEach((url) => {
      thumbRow.appendChild(
        createThumb({
          url,
          onRemove: async (e) => {
            e.preventDefault();
            if (!confirm('Remove this photo from the listing?')) return;
            setError('');
            try {
              const data = await fetchJson(`/api/seller/products/${product.id}/images/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
              });
              product.imageUrls = data?.plant?.imageUrls || [];
              product.imagePath = data?.plant?.imagePath || null;
              const nextMain = product.imagePath || product.imageUrls?.[0] || '';
              const main = card.querySelector('img');
              if (main && nextMain) main.src = nextMain;
              renderThumbs();
              onUpdated();
            } catch (err) {
              setError(err.message);
            }
          }
        })
      );
    });
  };

  renderThumbs();

  const manage = document.createElement('div');
  manage.className = 'manage-box';
  manage.innerHTML = `
    <details>
      <summary>Manage Listing</summary>

      <label>Name</label>
      <input type="text" data-name value="${product.name || ''}" />

      <label>Category</label>
      <select data-category>
        <option value="PLANT"${category === 'PLANT' ? ' selected' : ''}>Plants</option>
        <option value="CHEMICAL"${category === 'CHEMICAL' ? ' selected' : ''}>Chemicals &amp; Manure</option>
        <option value="TOOL"${category === 'TOOL' ? ' selected' : ''}>Tools</option>
      </select>

      <div data-size-wrap>
        <label>Size</label>
        <input type="text" data-size value="${product.size || ''}" placeholder="e.g. Width/Height or dimensions" />
      </div>

      <label>Care / Usage</label>
      <textarea data-care rows="4" placeholder="Care/usage instructions...">${product.care || ''}</textarea>

      <label>Price (INR)</label>
      <input type="number" data-price min="0" value="${Number(product.price || 0)}" />

      <label>Set Stock</label>
      <input type="number" data-stock-set min="0" value="${Number(product.stock || 0)}" />

      <label>Add Photos (max 5 total)</label>
      <input type="file" data-images accept="image/*" multiple />

      <div class="manage-actions">
        <button type="button" class="cta-button" data-save>Save Changes</button>
        <button type="button" class="cta-button secondary" data-add-stock>Add Stock</button>
        <button type="button" class="cta-button secondary" data-add-photos>Add Photos</button>
        <button type="button" class="cta-button danger" data-delete>Delete Listing</button>
      </div>
      <div style="margin-top:10px;">
        <input type="number" data-stock-add min="1" placeholder="Add stock amount" class="stock-input" />
      </div>
    </details>
  `;

  card.appendChild(manage);

  const nameInput = manage.querySelector('[data-name]');
  const categorySelect = manage.querySelector('[data-category]');
  const sizeWrap = manage.querySelector('[data-size-wrap]');
  const sizeInput = manage.querySelector('[data-size]');
  const careInput = manage.querySelector('[data-care]');
  const priceInput = manage.querySelector('[data-price]');
  const stockSetInput = manage.querySelector('[data-stock-set]');
  const imagesInput = manage.querySelector('[data-images]');
  const addStockInput = manage.querySelector('[data-stock-add]');

  const applyCategoryVisibility = () => {
    const value = String(categorySelect?.value || 'PLANT').toUpperCase();
    if (sizeWrap) sizeWrap.style.display = value === 'PLANT' ? 'block' : 'none';
  };
  if (categorySelect) categorySelect.onchange = applyCategoryVisibility;
  applyCategoryVisibility();

  manage.querySelector('[data-save]').onclick = async () => {
    setError('');
    const nextCategory = String(categorySelect?.value || 'PLANT').toUpperCase();
    const nextSize = String(sizeInput?.value || '').trim();
    if (nextCategory === 'PLANT' && !nextSize) {
      setError('Size is required for plants.');
      return;
    }

    try {
      const payload = {
        name: String(nameInput?.value || '').trim(),
        category: nextCategory,
        care: String(careInput?.value || '').trim(),
        price: Number(priceInput?.value || 0),
        stock: Number(stockSetInput?.value || 0),
        size: nextCategory === 'PLANT' ? nextSize : null
      };
      const data = await fetchJson(`/api/update-plant/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const updated = data?.plant;
      if (updated) {
        product.name = updated.name;
        product.category = updated.category;
        product.size = updated.size;
        product.care = updated.care;
        product.price = updated.price;
        product.stock = updated.stock;
        product.imagePath = updated.imagePath;
        product.imageUrls = updated.imageUrls;
      }

      card.querySelector('h3').textContent = product.name;
      const img = card.querySelector('img');
      const nextMain = product.imagePath || product.imageUrls?.[0] || '';
      if (img && nextMain) img.src = nextMain;
      card.querySelector('[data-stock]').textContent = String(product.stock);

      onUpdated();
    } catch (err) {
      setError(err.message);
    }
  };

  manage.querySelector('[data-add-stock]').onclick = async () => {
    setError('');
    const addAmount = Number(addStockInput?.value || 0);
    if (!addAmount || addAmount < 1) {
      setError('Enter a valid amount to add.');
      return;
    }

    try {
      const nextStock = Number(product.stock || 0) + addAmount;
      const data = await fetchJson(`/api/update-plant/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: nextStock })
      });
      const updated = data?.plant;
      if (updated) {
        product.stock = updated.stock;
      } else {
        product.stock = nextStock;
      }
      card.querySelector('[data-stock]').textContent = String(product.stock);
      stockSetInput.value = String(product.stock);
      addStockInput.value = '';
      onUpdated();
    } catch (err) {
      setError(err.message);
    }
  };

  manage.querySelector('[data-add-photos]').onclick = async () => {
    setError('');
    const files = imagesInput?.files ? Array.from(imagesInput.files) : [];
    if (!files.length) {
      setError('Select at least one photo.');
      return;
    }

    const currentCount = Array.isArray(product.imageUrls) ? product.imageUrls.length : 0;
    if (currentCount + files.length > 5) {
      setError(`Max 5 photos allowed (currently ${currentCount}).`);
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));

    try {
      const data = await fetchJson(`/api/seller/products/${product.id}/images`, {
        method: 'POST',
        body: formData
      });
      product.imageUrls = data?.plant?.imageUrls || [];
      product.imagePath = data?.plant?.imagePath || null;
      const nextMain = product.imagePath || product.imageUrls?.[0] || '';
      const img = card.querySelector('img');
      if (img && nextMain) img.src = nextMain;
      imagesInput.value = '';
      renderThumbs();
      onUpdated();
    } catch (err) {
      setError(err.message);
    }
  };

  manage.querySelector('[data-delete]').onclick = async () => {
    if (!confirm('Soft delete this listing? It will disappear from browsing but remain in order history.')) return;
    setError('');
    try {
      await fetchJson(`/api/seller/products/${product.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Deleted by seller' })
      });
      onDeleted(product.id);
    } catch (err) {
      setError(err.message);
    }
  };

  return card;
};

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
    const data = await fetchJson('/api/me', { cache: 'no-store' });
    me = data.user || null;
  } catch {
    me = null;
  }

  if (!me || me.role !== 'SELLER') {
    alert('Please log in as seller.');
    window.location.href = 'seller.html';
    return;
  }

  const errorEl = document.getElementById('dashboardError');
  const setError = (msg) => {
    if (!errorEl) return;
    errorEl.textContent = msg || '';
  };

  const container = document.getElementById('dashboardContainer');
  if (!container) return;

  const load = async () => {
    setError('');
    container.innerHTML = '';

    const data = await fetchJson('/api/my-dashboard', { cache: 'no-store' });
    renderSummary(data.summary);

    const products = Array.isArray(data.products) ? data.products : [];
    if (!products.length) {
      container.innerHTML = "<p style='text-align:center;'>You haven't listed anything yet.</p>";
      return;
    }

    const onUpdated = async () => {
      try {
        const refreshed = await fetchJson('/api/my-dashboard', { cache: 'no-store' });
        renderSummary(refreshed.summary);
      } catch {
        // ignore
      }
    };

    const onDeleted = (id) => {
      const card = container.querySelector(`[data-card-id="${id}"]`);
      if (card) card.remove();
      if (!container.children.length) {
        container.innerHTML = "<p style='text-align:center;'>You haven't listed anything yet.</p>";
      }
      onUpdated();
    };

    products.forEach((product) => {
      const card = buildProductCard(product, { onUpdated, onDeleted, setError });
      card.setAttribute('data-card-id', String(product.id));
      container.appendChild(card);
    });
  };

  try {
    await load();
  } catch (err) {
    console.error(err);
    setError(err.message);
    container.textContent = 'Error loading dashboard.';
  }
});

