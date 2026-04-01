const $ = (id) => document.getElementById(id);

let currentAdminUser = null;
let activeTab = 'summary';

const ui = () => window.GreenLeafUI;

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
  activeTab = tab;
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
      <div class="section-title section-title-plain">${escapeHtml(title)}</div>
      ${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
    </div>
  `;
  return div;
}

function formatMoney(value) {
  const numberValue = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(numberValue);
  } catch {
    return `INR ${numberValue.toFixed(2)}`;
  }
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
    renderSummaryCard('Products', [`Active: ${summary.plants.active}`, `Deleted: ${summary.plants.deleted}`])
  );

  container.appendChild(
    renderSummaryCard(
      'Orders',
      Object.entries(summary.orders.byStatus || {}).map(([status, count]) => `${status}: ${count}`)
    )
  );

  if (summary.revenue) {
    container.appendChild(
      renderSummaryCard('Platform Revenue (PAID/FULFILLED)', [
        `Paid orders: ${summary.revenue.paidOrders || 0}`,
        `Gross sales: ${formatMoney(summary.revenue.grossSales || 0)}`,
        `Platform fee (20%): ${formatMoney(summary.revenue.platformFee || 0)}`,
        `Seller payout (80%): ${formatMoney(summary.revenue.sellerPayout || 0)}`
      ])
    );
  }
}

async function loadUsers() {
  const users = await fetchJson('/api/admin/users', { cache: 'no-store' });
  const container = $('usersTable');

  const rows = users
    .map((user) => {
      const disabled = Boolean(user.disabledAt);
      const isSelf = Boolean(currentAdminUser && Number(currentAdminUser.id) === Number(user.id));
      return `
        <tr>
          <td>${user.id}</td>
          <td>${escapeHtml(user.email)}</td>
          <td>${escapeHtml(user.name)}</td>
          <td>
            <select data-user-role="${user.id}">
              ${['CUSTOMER', 'SELLER', 'ADMIN']
                .map((role) => `<option value="${role}"${user.role === role ? ' selected' : ''}>${role}</option>`)
                .join('')}
            </select>
          </td>
          <td>${disabled ? 'Yes' : 'No'}</td>
          <td class="admin-actions">
            <button class="cta-button secondary" data-user-edit="${user.id}">Edit</button>
            <button class="cta-button secondary" data-user-save="${user.id}">Save</button>
            ${
              isSelf
                ? ''
                : disabled
                  ? `<button class="cta-button" data-user-enable="${user.id}">Enable</button>`
                  : `<button class="cta-button" data-user-disable="${user.id}">Disable</button>`
            }
            ${isSelf ? '' : `<button class="cta-button danger" data-user-delete="${user.id}">Delete</button>`}
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

  document.querySelectorAll('[data-user-delete]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-user-delete');
      const user = users.find((entry) => String(entry.id) === String(id));
      const label = user?.email ? `${user.email}` : `user #${id}`;
      const confirmation = await ui()?.prompt(`Type DELETE to permanently delete ${label}:`, {
        title: 'Delete user permanently',
        label: 'Type DELETE to confirm',
        placeholder: 'DELETE',
        confirmText: 'Delete user',
        cancelText: 'Keep user'
      });
      if (confirmation !== 'DELETE') return;

      try {
        await fetchJson(`/api/admin/users/${id}`, { method: 'DELETE' });
        await loadUsers();
        await loadSummary().catch(() => {});
      } catch (err) {
        setError(err.message);
      }
    };
  });

  document.querySelectorAll('[data-user-edit]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-user-edit');
      const user = users.find((entry) => String(entry.id) === String(id));
      if (!user) return;

      const values = await ui()?.form({
        title: 'Edit user',
        message: user.email,
        confirmText: 'Save profile',
        cancelText: 'Cancel',
        fields: [
          { name: 'name', label: 'Name', value: user.name, required: true },
          { name: 'phone', label: 'Phone (optional)', value: user.phone || '' }
        ]
      });
      if (!values) return;

      try {
        await fetchJson(`/api/admin/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name, phone: values.phone })
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
      const reason =
        (await ui()?.prompt('Optional: add a reason for disabling this account.', {
          title: 'Disable user',
          label: 'Reason',
          placeholder: 'Reason (optional)',
          confirmText: 'Disable user',
          cancelText: 'Cancel'
        })) || '';

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
  const categorySelect = $('adminProductCategory');
  const categoryValue = categorySelect ? String(categorySelect.value || '').trim() : 'PLANT';
  const params = new URLSearchParams({ ts: String(Date.now()) });
  if (categoryValue) params.set('category', categoryValue);
  const plants = await fetchJson(`/api/admin/plants?${params.toString()}`, { cache: 'no-store' });
  const container = $('plantsTable');

  const rows = plants
    .map((plant) => {
      const deleted = Boolean(plant.deletedAt);
      return `
        <tr>
          <td>${plant.id}</td>
          <td>${escapeHtml(plant.name)}</td>
          <td>${escapeHtml(plant.category || '')}</td>
          <td>${escapeHtml(plant.sellerEmail || '')}</td>
          <td>${plant.price}</td>
          <td>${plant.stock}</td>
          <td>${deleted ? 'Yes' : 'No'}</td>
          <td class="admin-actions">
            <button class="cta-button secondary" data-plant-edit="${plant.id}">Edit</button>
            ${
              deleted
                ? `<button class="cta-button" data-plant-restore="${plant.id}">Restore</button>`
                : `<button class="cta-button" data-plant-delete="${plant.id}">Delete</button>`
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
            <th>Category</th>
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
      const plant = plants.find((entry) => String(entry.id) === String(id));
      if (!plant) return;

      const values = await ui()?.form({
        title: 'Edit product',
        message: plant.name,
        confirmText: 'Save product',
        cancelText: 'Cancel',
        fields: [
          { name: 'name', label: 'Name', value: plant.name, required: true },
          { name: 'price', label: 'Price', type: 'number', value: String(plant.price), min: 0, required: true },
          { name: 'stock', label: 'Stock', type: 'number', value: String(plant.stock), min: 0, required: true }
        ]
      });
      if (!values) return;

      try {
        await fetchJson(`/api/admin/plants/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            price: Number(values.price),
            stock: Number(values.stock)
          })
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
      const confirmed = await ui()?.confirm('Delete this product? It will be hidden from customers.', {
        title: 'Delete product',
        confirmText: 'Delete product',
        cancelText: 'Keep product'
      });
      if (!confirmed) return;

      const reason =
        (await ui()?.prompt('Optional: add a reason for deleting this product.', {
          title: 'Delete product',
          label: 'Reason',
          placeholder: 'Reason (optional)',
          confirmText: 'Continue',
          cancelText: 'Skip'
        })) || '';

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
    .map((order) => {
      const itemsCount = Array.isArray(order.items) ? order.items.length : 0;
      const address = String(order.address || '');
      const addressShort = address.length > 40 ? `${address.slice(0, 40)}...` : address;
      return `
        <tr>
          <td>${order.id}</td>
          <td>${escapeHtml(order.email || '')}</td>
          <td>${escapeHtml(order.paymentMethod)}</td>
          <td>${escapeHtml(order.status)}</td>
          <td>${order.total}</td>
          <td title="${escapeHtml(address)}">${escapeHtml(addressShort)}</td>
          <td>${itemsCount}</td>
          <td>
            <select data-order-status="${order.id}">
              ${['PENDING', 'PAID', 'FULFILLED', 'CANCELLED']
                .map((status) => `<option value="${status}"${order.status === status ? ' selected' : ''}>${status}</option>`)
                .join('')}
            </select>
            <button class="cta-button secondary" data-order-save="${order.id}">Update</button>
            <button class="cta-button secondary" data-order-view="${order.id}">View</button>
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
    btn.onclick = async () => {
      const id = btn.getAttribute('data-order-view');
      const order = orders.find((entry) => String(entry.id) === String(id));
      if (!order) return;

      const lines = (order.items || []).map((item) => `- ${item.plantName} x${item.quantity} = ${item.subtotal}`);
      await ui()?.alert(
        `Status: ${order.status}\nPayment: ${order.paymentMethod}\nTotal: ${order.total}\n\nItems:\n${lines.join('\n')}`,
        {
          title: `Order #${order.id}`,
          confirmText: 'Close snapshot'
        }
      );
    };
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentAdminUser = await requireAdmin();
  } catch {
    window.location.href = 'admin-login.html';
    return;
  }

  $('adminLogout').onclick = async (event) => {
    event.preventDefault();
    try {
      await fetchJson('/logout', { method: 'POST' });
    } catch {
      // ignore logout failures
    }
    window.location.href = '/';
  };

  const categorySelect = $('adminProductCategory');
  if (categorySelect) {
    categorySelect.onchange = async () => {
      if (activeTab !== 'plants') return;
      setError('');
      try {
        await loadPlants();
      } catch (err) {
        setError(err.message);
      }
    };
  }

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
