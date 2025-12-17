const $ = (id) => document.getElementById(id);

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const message = typeof data === 'object' && data ? data.message : null;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showTab(tab) {
  document.querySelectorAll('.admin-tab').forEach((el) => (el.style.display = 'none'));
  const active = $(`tab-${tab}`);
  if (active) active.style.display = '';
}

function setError(message) {
  $('adminError').textContent = message || '';
}

async function requireAdmin() {
  const me = await fetchJson('/api/me', { cache: 'no-store' });
  if (!me?.user) {
    window.location.href = 'admin-login.html';
    throw new Error('Not authenticated');
  }
  if (me.user.role !== 'ADMIN') {
    window.location.href = 'admin-login.html';
    throw new Error('Forbidden');
  }
  return me.user;
}

function renderSummaryCard(title, lines) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-content">
      <div class="section-title" style="border:none; padding-left:0; margin-top:0;">${escapeHtml(title)}</div>
      ${lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
    </div>
  `;
  return div;
}

async function loadSummary() {
  const summary = await fetchJson('/api/admin/summary', { cache: 'no-store' });
  if (!summary || typeof summary !== 'object' || typeof summary.users !== 'object' || !summary.users) {
    throw new Error('Unable to load summary. Please refresh and try again.');
  }
  const container = $('summaryCards');
  container.innerHTML = '';

  container.appendChild(
    renderSummaryCard('Users', [
      `Total: ${summary.users.total}`,
      `Disabled: ${summary.users.disabled}`,
      ...Object.entries(summary.users.byRole || {}).map(([role, count]) => `${role}: ${count}`)
    ])
  );

  container.appendChild(
    renderSummaryCard('Plants', [`Active: ${summary.plants.active}`, `Deleted: ${summary.plants.deleted}`])
  );

  container.appendChild(
    renderSummaryCard(
      'Orders',
      Object.entries(summary.orders.byStatus || {}).map(([status, count]) => `${status}: ${count}`)
    )
  );
}

async function loadUsers() {
  const users = await fetchJson('/api/admin/users', { cache: 'no-store' });
  const container = $('usersTable');

  const rows = users
    .map((u) => {
      const disabled = Boolean(u.disabledAt);
      return `
        <tr>
          <td>${u.id}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.name)}</td>
          <td>
            <select data-user-role="${u.id}">
              ${['CUSTOMER', 'SELLER', 'ADMIN']
                .map((r) => `<option value="${r}"${u.role === r ? ' selected' : ''}>${r}</option>`)
                .join('')}
            </select>
          </td>
          <td>${disabled ? 'Yes' : 'No'}</td>
          <td class="admin-actions">
            <button class="cta-button secondary" data-user-edit="${u.id}">Edit</button>
            <button class="cta-button secondary" data-user-save="${u.id}">Save</button>
            ${
              disabled
                ? `<button class="cta-button" data-user-enable="${u.id}">Enable</button>`
                : `<button class="cta-button" data-user-disable="${u.id}">Disable</button>`
            }
          </td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Disabled</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll('[data-user-save]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-user-save');
      const select = document.querySelector(`[data-user-role="${id}"]`);
      const role = select?.value;
      try {
        await fetchJson(`/api/admin/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role })
        });
        await loadUsers();
      } catch (err) {
        setError(err.message);
      }
    };
  });

  document.querySelectorAll('[data-user-edit]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-user-edit');
      const user = users.find((u) => String(u.id) === String(id));
      if (!user) return;
      const name = prompt('Name:', user.name) ?? user.name;
      const phone = prompt('Phone (optional):', user.phone || '') ?? user.phone;
      try {
        await fetchJson(`/api/admin/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone })
        });
        await loadUsers();
      } catch (err) {
        setError(err.message);
      }
    };
  });

  document.querySelectorAll('[data-user-disable]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-user-disable');
      const reason = prompt('Disable reason (optional):', '') || '';
      try {
        await fetchJson(`/api/admin/users/${id}/disable`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        await loadUsers();
      } catch (err) {
        setError(err.message);
      }
    };
  });

  document.querySelectorAll('[data-user-enable]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-user-enable');
      try {
        await fetchJson(`/api/admin/users/${id}/enable`, { method: 'PUT' });
        await loadUsers();
      } catch (err) {
        setError(err.message);
      }
    };
  });
}

async function loadPlants() {
  const plants = await fetchJson('/api/admin/plants', { cache: 'no-store' });
  const container = $('plantsTable');

  const rows = plants
    .map((p) => {
      const deleted = Boolean(p.deletedAt);
      return `
        <tr>
          <td>${p.id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.sellerEmail || '')}</td>
          <td>${p.price}</td>
          <td>${p.stock}</td>
          <td>${deleted ? 'Yes' : 'No'}</td>
          <td class="admin-actions">
            <button class="cta-button secondary" data-plant-edit="${p.id}">Edit</button>
            ${
              deleted
                ? `<button class="cta-button" data-plant-restore="${p.id}">Restore</button>`
                : `<button class="cta-button" data-plant-delete="${p.id}">Delete</button>`
            }
          </td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Seller</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Deleted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll('[data-plant-edit]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-plant-edit');
      const plant = plants.find((p) => String(p.id) === String(id));
      if (!plant) return;

      const name = prompt('Name:', plant.name) ?? plant.name;
      const price = prompt('Price:', String(plant.price)) ?? String(plant.price);
      const stock = prompt('Stock:', String(plant.stock)) ?? String(plant.stock);
      try {
        await fetchJson(`/api/admin/plants/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, price: Number(price), stock: Number(stock) })
        });
        await loadPlants();
      } catch (err) {
        setError(err.message);
      }
    };
  });

  document.querySelectorAll('[data-plant-delete]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-plant-delete');
      if (!confirm('Delete this plant? (It will be hidden from customers)')) return;
      const reason = prompt('Delete reason (optional):', '') || '';
      try {
        await fetchJson(`/api/admin/plants/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        await loadPlants();
      } catch (err) {
        setError(err.message);
      }
    };
  });

  document.querySelectorAll('[data-plant-restore]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-plant-restore');
      try {
        await fetchJson(`/api/admin/plants/${id}/restore`, { method: 'PUT' });
        await loadPlants();
      } catch (err) {
        setError(err.message);
      }
    };
  });
}

async function loadOrders() {
  const orders = await fetchJson('/api/admin/orders', { cache: 'no-store' });
  const container = $('ordersTable');

  const rows = orders
    .map((o) => {
      const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
      const address = String(o.address || '');
      const addressShort = address.length > 40 ? address.slice(0, 40) + '…' : address;
      return `
        <tr>
          <td>${o.id}</td>
          <td>${escapeHtml(o.email || '')}</td>
          <td>${escapeHtml(o.paymentMethod)}</td>
          <td>${escapeHtml(o.status)}</td>
          <td>${o.total}</td>
          <td title="${escapeHtml(address)}">${escapeHtml(addressShort)}</td>
          <td>${itemsCount}</td>
          <td>
            <select data-order-status="${o.id}">
              ${['PENDING', 'PAID', 'FULFILLED', 'CANCELLED']
                .map((s) => `<option value="${s}"${o.status === s ? ' selected' : ''}>${s}</option>`)
                .join('')}
            </select>
            <button class="cta-button secondary" data-order-save="${o.id}">Update</button>
            <button class="cta-button secondary" data-order-view="${o.id}">View</button>
          </td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Total</th>
            <th>Address</th>
            <th>Items</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll('[data-order-save]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-order-save');
      const select = document.querySelector(`[data-order-status="${id}"]`);
      const status = select?.value;
      try {
        await fetchJson(`/api/admin/orders/${id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        await loadOrders();
      } catch (err) {
        setError(err.message);
      }
    };
  });

  document.querySelectorAll('[data-order-view]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-order-view');
      const order = orders.find((o) => String(o.id) === String(id));
      if (!order) return;
      const lines = (order.items || []).map(
        (i) => `- ${i.plantName} x${i.quantity} = ${i.subtotal}`
      );
      alert(
        `Order #${order.id}\n\nStatus: ${order.status}\nPayment: ${order.paymentMethod}\nTotal: ${order.total}\n\nItems:\n${lines.join(
          '\n'
        )}`
      );
    };
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await requireAdmin();
  } catch (err) {
    window.location.href = 'admin-login.html';
    return;
  }

  $('adminLogout').onclick = async (e) => {
    e.preventDefault();
    try {
      await fetchJson('/logout', { method: 'POST' });
    } catch {}
    window.location.href = 'admin-login.html';
  };

  document.querySelectorAll('.admin-tabs [data-tab]').forEach((btn) => {
    btn.onclick = async () => {
      const tab = btn.getAttribute('data-tab');
      setError('');
      showTab(tab);
      try {
        if (tab === 'summary') await loadSummary();
        if (tab === 'users') await loadUsers();
        if (tab === 'plants') await loadPlants();
        if (tab === 'orders') await loadOrders();
      } catch (err) {
        setError(err.message);
      }
    };
  });

  showTab('summary');
  try {
    await loadSummary();
  } catch (err) {
    setError(err.message);
  }
});
