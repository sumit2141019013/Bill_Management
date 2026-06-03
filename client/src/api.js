const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api';

// Get the logged-in tenant ID from localStorage
function getTenantId() {
  try {
    const saved = localStorage.getItem('billmgr_tenant');
    if (saved) {
      const tenant = JSON.parse(saved);
      return tenant.id;
    }
  } catch (e) {}
  return null;
}

async function request(url, options = {}) {
  const tenantId = getTenantId();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add tenant ID header for ownership validation
  if (tenantId) {
    headers['X-Tenant-Id'] = String(tenantId);
  }

  const response = await fetch(`${API_BASE}${url}`, {
    headers,
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || 'Request failed');
  }

  // Handle blob responses (Excel download)
  if (response.headers.get('content-type')?.includes('spreadsheet')) {
    return response.blob();
  }

  return response.json();
}

export const api = {
  // Auth
  login: (name, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ name, password }) }),
  register: (name, phone, password, isAdmin = false) => request('/auth/register', { method: 'POST', body: JSON.stringify({ name, phone, password, is_admin: isAdmin }) }),
  setupCredentials: (tenant_id, phone, password) => request('/auth/setup', { method: 'POST', body: JSON.stringify({ tenant_id, phone, password }) }),
  getMe: (id) => request(`/auth/me/${id}`),
  changePassword: (tenant_id, old_password, new_password) => request('/auth/change-password', { method: 'PUT', body: JSON.stringify({ tenant_id, old_password, new_password }) }),

  // Tenants
  getTenants: () => request('/tenants'),
  getTenant: (id) => request(`/tenants/${id}`),
  createTenant: (data) => request('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  updateTenant: (id, data) => request(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTenant: (id) => request(`/tenants/${id}`, { method: 'DELETE' }),

  // Billing Months
  getMonths: () => request('/billing/months'),
  getMonth: (id) => request(`/billing/months/${id}`),
  createMonth: (data) => request('/billing/months', { method: 'POST', body: JSON.stringify(data) }),
  closeMonth: (id, data) => request(`/billing/months/${id}/close`, { method: 'PUT', body: JSON.stringify(data) }),
  calculateBills: (id) => request(`/billing/months/${id}/calculate`),
  deleteMonth: (id) => request(`/billing/months/${id}`, { method: 'DELETE' }),

  // Events
  createEvent: (data) => request('/billing/events', { method: 'POST', body: JSON.stringify(data) }),
  deleteEvent: (id) => request(`/billing/events/${id}`, { method: 'DELETE' }),

  // Export
  exportExcel: async (monthId) => {
    const response = await fetch(`${API_BASE}/export/excel/${monthId}`);
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill_${monthId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
