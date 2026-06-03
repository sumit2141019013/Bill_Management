const express = require('express');
const router = express.Router();
const { query } = require('../database');

// POST /api/auth/login — login with name (or phone) + password
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body; // We accept 'name', but we'll check it against both name and phone
    if (!name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    // Try to find by name (case-insensitive) or by phone
    const result = await query(
      'SELECT id, name, phone, is_active, joined_date, is_admin FROM tenants WHERE LOWER(name) = LOWER($1) OR phone = $2', 
      [name, name]
    );
    
    let tenant = result.rows[0];
    
    if (!tenant) {
      return res.status(401).json({ error: 'No account found with this name or phone' });
    }

    // Check password if tenant exists
    const pwdResult = await query('SELECT password FROM tenants WHERE id = $1', [tenant.id]);
    if (pwdResult.rows[0].password !== password) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    res.json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register — register a new tenant
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, is_admin } = req.body;
    if (!name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    // Check if name or phone already exists
    let existingQuery = 'SELECT id FROM tenants WHERE LOWER(name) = LOWER($1)';
    let existingParams = [name];
    if (phone) {
      existingQuery += ' OR phone = $2';
      existingParams.push(phone);
    }
    const existing = await query(existingQuery, existingParams);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'A tenant with this name or phone already exists' });
    }

    const today = new Date().toISOString().split('T')[0];
    const insertResult = await query(
      'INSERT INTO tenants (name, phone, password, is_active, is_admin, joined_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, phone, is_active, joined_date, is_admin',
      [name, phone || null, password, 1, is_admin ? 1 : 0, today]
    );
    res.json({ tenant: insertResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// duplicate register endpoint removed

// POST /api/auth/setup — set phone + password for a tenant who doesn't have credentials yet
router.post('/setup', async (req, res) => {
  try {
    const { tenant_id, phone, password } = req.body;
    if (!tenant_id || !phone || !password) {
      return res.status(400).json({ error: 'tenant_id, phone, and password are required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const tenantResult = await query('SELECT * FROM tenants WHERE id = $1', [tenant_id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check phone is not already taken by another tenant
    const existing = await query('SELECT id FROM tenants WHERE phone = $1 AND id != $2', [phone, tenant_id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'This phone number is already used by another tenant' });
    }

    await query('UPDATE tenants SET phone = $1, password = $2 WHERE id = $3', [phone, password, tenant_id]);
    const updated = await query('SELECT id, name, phone, is_active, joined_date, is_admin FROM tenants WHERE id = $1', [tenant_id]);
    res.json({ tenant: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me/:id — get the logged-in tenant's profile
router.get('/me/:id', async (req, res) => {
  try {
    const result = await query('SELECT id, name, phone, is_active, joined_date, is_admin FROM tenants WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/change-password — change password
router.put('/change-password', async (req, res) => {
  try {
    const { tenant_id, old_password, new_password } = req.body;
    if (!tenant_id || !old_password || !new_password) {
      return res.status(400).json({ error: 'tenant_id, old_password, and new_password are required' });
    }

    if (new_password.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }

    const tenantResult = await query('SELECT * FROM tenants WHERE id = $1', [tenant_id]);
    if (tenantResult.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

    if (tenantResult.rows[0].password !== old_password) {
      return res.status(401).json({ error: 'Old password is incorrect' });
    }

    await query('UPDATE tenants SET password = $1 WHERE id = $2', [new_password, tenant_id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
