const express = require('express');
const router = express.Router();
const db = require('../database');

// POST /api/auth/login — login with phone + password
router.post('/login', (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    const tenant = db.prepare('SELECT id, name, phone, is_active, joined_date, is_admin FROM tenants WHERE phone = ?').get(phone);
    if (!tenant) {
      return res.status(401).json({ error: 'No account found with this phone number' });
    }

    // Check password
    const fullTenant = db.prepare('SELECT password FROM tenants WHERE id = ?').get(tenant.id);
    if (fullTenant.password !== password) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    res.json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/setup — set phone + password for a tenant who doesn't have credentials yet
router.post('/setup', (req, res) => {
  try {
    const { tenant_id, phone, password } = req.body;
    if (!tenant_id || !phone || !password) {
      return res.status(400).json({ error: 'tenant_id, phone, and password are required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check phone is not already taken by another tenant
    const existing = db.prepare('SELECT id FROM tenants WHERE phone = ? AND id != ?').get(phone, tenant_id);
    if (existing) {
      return res.status(400).json({ error: 'This phone number is already used by another tenant' });
    }

    db.prepare('UPDATE tenants SET phone = ?, password = ? WHERE id = ?').run(phone, password, tenant_id);
    const updated = db.prepare('SELECT id, name, phone, is_active, joined_date, is_admin FROM tenants WHERE id = ?').get(tenant_id);
    res.json({ tenant: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me/:id — get the logged-in tenant's profile
router.get('/me/:id', (req, res) => {
  try {
    const tenant = db.prepare('SELECT id, name, phone, is_active, joined_date, is_admin FROM tenants WHERE id = ?').get(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/change-password — change password
router.put('/change-password', (req, res) => {
  try {
    const { tenant_id, old_password, new_password } = req.body;
    if (!tenant_id || !old_password || !new_password) {
      return res.status(400).json({ error: 'tenant_id, old_password, and new_password are required' });
    }

    if (new_password.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant_id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    if (tenant.password !== old_password) {
      return res.status(401).json({ error: 'Old password is incorrect' });
    }

    db.prepare('UPDATE tenants SET password = ? WHERE id = ?').run(new_password, tenant_id);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
