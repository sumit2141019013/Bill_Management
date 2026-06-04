const express = require('express');
const router = express.Router();
const { query } = require('../database');

// Mask a phone number for privacy (e.g. 9876543210 -> 98****3210)
function maskPhone(phone) {
  if (!phone || phone.length < 6) return phone;
  const len = phone.length;
  return phone.slice(0, 2) + '*'.repeat(len - 4) + phone.slice(-4);
}

// GET all tenants
router.get('/', async (req, res) => {
  try {
    const loggedInTenantId = req.headers['x-tenant-id'];
    let isAdmin = false;
    if (loggedInTenantId) {
      const userRes = await query('SELECT is_admin FROM tenants WHERE id = $1', [loggedInTenantId]);
      if (userRes.rows[0]) isAdmin = !!userRes.rows[0].is_admin;
    }
    const result = await query('SELECT id, name, phone, is_active, joined_date, created_at, is_admin FROM tenants ORDER BY name');
    const rows = result.rows.map(t => {
      // Mask phone for non-self, non-admin
      if (!isAdmin && String(t.id) !== String(loggedInTenantId)) {
        return { ...t, phone: maskPhone(t.phone) };
      }
      return t;
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single tenant
router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM tenants WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new tenant
router.post('/', async (req, res) => {
  try {
    const { name, joined_date, phone, password } = req.body;
    if (!name || !joined_date) {
      return res.status(400).json({ error: 'Name and joined_date are required' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits' });
    }

    const existing = await query('SELECT id FROM tenants WHERE phone = $1', [cleanPhone]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'This phone number is already used by another tenant' });
    }

    const pwd = password || '1234';
    const result = await query(
      'INSERT INTO tenants (name, joined_date, phone, password) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, joined_date, cleanPhone, pwd]
    );
    const tenant = await query('SELECT id, name, phone, is_active, joined_date, is_admin FROM tenants WHERE id = $1', [result.rows[0].id]);
    res.status(201).json(tenant.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update tenant (only own profile via X-Tenant-Id header)
router.put('/:id', async (req, res) => {
  try {
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (loggedInTenantId) {
      const userResult = await query('SELECT is_admin FROM tenants WHERE id = $1', [loggedInTenantId]);
      const user = userResult.rows[0];
      if (!user || (!user.is_admin && parseInt(loggedInTenantId) !== parseInt(req.params.id))) {
        return res.status(403).json({ error: 'You can only edit your own profile' });
      }
    }

    const { name, is_active, phone } = req.body;
    const tenantResult = await query('SELECT * FROM tenants WHERE id = $1', [req.params.id]);
    if (tenantResult.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    const tenant = tenantResult.rows[0];

    const updatedName = name !== undefined ? name : tenant.name;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : tenant.is_active;
    
    let updatedPhone = tenant.phone;
    if (phone !== undefined) {
      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
      }
      const cleanPhone = phone.trim().replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        return res.status(400).json({ error: 'Phone number must be exactly 10 digits' });
      }
      if (cleanPhone !== tenant.phone) {
        const existing = await query('SELECT id FROM tenants WHERE phone = $1 AND id != $2', [cleanPhone, req.params.id]);
        if (existing.rows.length > 0) {
          return res.status(400).json({ error: 'This phone number is already used by another tenant' });
        }
      }
      updatedPhone = cleanPhone;
    }

    await query('UPDATE tenants SET name = $1, is_active = $2, phone = $3 WHERE id = $4', [updatedName, updatedActive, updatedPhone, req.params.id]);
    const updated = await query('SELECT id, name, phone, is_active, joined_date, created_at, is_admin FROM tenants WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE tenant (Admin only)
router.delete('/:id', async (req, res) => {
  try {
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (!loggedInTenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userResult = await query('SELECT is_admin FROM tenants WHERE id = $1', [loggedInTenantId]);
    const user = userResult.rows[0];
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Only Admin can delete tenants' });
    }

    const tenantResult = await query('SELECT * FROM tenants WHERE id = $1', [req.params.id]);
    if (tenantResult.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

    // Manually cascade delete to avoid foreign key constraint errors
    await query('DELETE FROM tenant_month_status WHERE tenant_id = $1', [req.params.id]);
    await query('DELETE FROM bill_shares WHERE tenant_id = $1', [req.params.id]);
    await query('DELETE FROM events WHERE tenant_id = $1', [req.params.id]);

    await query('DELETE FROM tenants WHERE id = $1', [req.params.id]);
    res.json({ message: 'Tenant deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
