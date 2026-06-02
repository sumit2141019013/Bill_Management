const express = require('express');
const router = express.Router();
const db = require('../database');

// GET all tenants
router.get('/', (req, res) => {
  try {
    const tenants = db.prepare('SELECT * FROM tenants ORDER BY name').all();
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single tenant
router.get('/:id', (req, res) => {
  try {
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new tenant
router.post('/', (req, res) => {
  try {
    const { name, joined_date, phone, password } = req.body;
    if (!name || !joined_date) {
      return res.status(400).json({ error: 'Name and joined_date are required' });
    }
    if (phone) {
      const existing = db.prepare('SELECT id FROM tenants WHERE phone = ?').get(phone);
      if (existing) {
        return res.status(400).json({ error: 'This phone number is already used by another tenant' });
      }
    }
    const pwd = password || '1234';
    const result = db.prepare('INSERT INTO tenants (name, joined_date, phone, password) VALUES (?, ?, ?, ?)').run(name, joined_date, phone || null, pwd);
    const tenant = db.prepare('SELECT id, name, phone, is_active, joined_date, is_admin FROM tenants WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update tenant (only own profile via X-Tenant-Id header)
router.put('/:id', (req, res) => {
  try {
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (loggedInTenantId) {
      const user = db.prepare('SELECT is_admin FROM tenants WHERE id = ?').get(loggedInTenantId);
      if (!user || (!user.is_admin && parseInt(loggedInTenantId) !== parseInt(req.params.id))) {
        return res.status(403).json({ error: 'You can only edit your own profile' });
      }
    }

    const { name, is_active, phone } = req.body;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const updatedName = name !== undefined ? name : tenant.name;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : tenant.is_active;
    const updatedPhone = phone !== undefined ? phone : tenant.phone;

    // Check phone uniqueness if changed
    if (phone && phone !== tenant.phone) {
      const existing = db.prepare('SELECT id FROM tenants WHERE phone = ? AND id != ?').get(phone, req.params.id);
      if (existing) {
        return res.status(400).json({ error: 'This phone number is already used by another tenant' });
      }
    }

    db.prepare('UPDATE tenants SET name = ?, is_active = ?, phone = ? WHERE id = ?').run(updatedName, updatedActive, updatedPhone, req.params.id);
    const updated = db.prepare('SELECT id, name, phone, is_active, joined_date, created_at, is_admin FROM tenants WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE tenant (Admin only)
router.delete('/:id', (req, res) => {
  try {
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (!loggedInTenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const user = db.prepare('SELECT is_admin FROM tenants WHERE id = ?').get(loggedInTenantId);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Only Admin can delete tenants' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    
    // Manually cascade delete to avoid foreign key constraint errors
    db.prepare('DELETE FROM tenant_month_status WHERE tenant_id = ?').run(req.params.id);
    db.prepare('DELETE FROM bill_shares WHERE tenant_id = ?').run(req.params.id);
    db.prepare('DELETE FROM events WHERE tenant_id = ?').run(req.params.id);
    
    db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);
    res.json({ message: 'Tenant deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
