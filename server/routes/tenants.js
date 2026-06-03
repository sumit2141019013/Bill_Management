const express = require('express');
const router = express.Router();
const { query } = require('../database');

// GET all tenants
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM tenants ORDER BY name');
    res.json(result.rows);
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
    if (phone) {
      const existing = await query('SELECT id FROM tenants WHERE phone = $1', [phone]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'This phone number is already used by another tenant' });
      }
    }
    const pwd = password || '1234';
    const result = await query(
      'INSERT INTO tenants (name, joined_date, phone, password) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, joined_date, phone || null, pwd]
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
    const updatedPhone = phone !== undefined ? phone : tenant.phone;

    // Check phone uniqueness if changed
    if (phone && phone !== tenant.phone) {
      const existing = await query('SELECT id FROM tenants WHERE phone = $1 AND id != $2', [phone, req.params.id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'This phone number is already used by another tenant' });
      }
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
