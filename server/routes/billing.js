const express = require('express');
const router = express.Router();
const db = require('../database');

// GET all billing months
router.get('/months', (req, res) => {
  try {
    const months = db.prepare(`
      SELECT bm.*, 
        (SELECT COUNT(*) FROM tenant_month_status tms WHERE tms.billing_month_id = bm.id AND tms.is_present = 1) as active_tenants
      FROM billing_months bm 
      ORDER BY bm.month DESC
    `).all();
    res.json(months);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single billing month with details
router.get('/months/:id', (req, res) => {
  try {
    const month = db.prepare('SELECT * FROM billing_months WHERE id = ?').get(req.params.id);
    if (!month) return res.status(404).json({ error: 'Billing month not found' });

    const events = db.prepare(`
      SELECT e.*, t.name as tenant_name 
      FROM events e 
      LEFT JOIN tenants t ON e.tenant_id = t.id 
      WHERE e.billing_month_id = ? 
      ORDER BY e.meter_reading ASC, 
               CASE WHEN e.event_type = 'MONTH_START' THEN 0 
                    WHEN e.event_type = 'MONTH_END' THEN 2 
                    ELSE 1 END ASC, 
               e.id ASC
    `).all(req.params.id);

    const tenantStatus = db.prepare(`
      SELECT tms.*, t.name as tenant_name 
      FROM tenant_month_status tms 
      JOIN tenants t ON tms.tenant_id = t.id 
      WHERE tms.billing_month_id = ?
    `).all(req.params.id);

    const billShares = db.prepare(`
      SELECT bs.*, t.name as tenant_name 
      FROM bill_shares bs 
      JOIN tenants t ON bs.tenant_id = t.id 
      WHERE bs.billing_month_id = ?
    `).all(req.params.id);

    res.json({ ...month, events, tenantStatus, billShares });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST start new billing month
router.post('/months', (req, res) => {
  try {
    const { month, start_reading, rate_per_unit } = req.body;
    if (!month || start_reading === undefined) {
      return res.status(400).json({ error: 'Month and start_reading are required' });
    }

    // Check if month already exists
    const existing = db.prepare('SELECT * FROM billing_months WHERE month = ?').get(month);
    if (existing) {
      return res.status(400).json({ error: 'Billing month already exists' });
    }

    const rate = rate_per_unit || 10;
    const result = db.prepare('INSERT INTO billing_months (month, start_reading, rate_per_unit) VALUES (?, ?, ?)').run(month, start_reading, rate);
    const billingMonthId = result.lastInsertRowid;

    // Create MONTH_START event
    db.prepare('INSERT INTO events (billing_month_id, event_type, meter_reading, event_date) VALUES (?, ?, ?, ?)').run(billingMonthId, 'MONTH_START', start_reading, month + '-01');

    // Add all active tenants (excluding admin) to this month
    const activeTenants = db.prepare('SELECT * FROM tenants WHERE is_active = 1 AND is_admin = 0').all();
    const insertStatus = db.prepare('INSERT INTO tenant_month_status (billing_month_id, tenant_id, is_present) VALUES (?, ?, 1)');
    for (const tenant of activeTenants) {
      insertStatus.run(billingMonthId, tenant.id);
    }

    const created = db.prepare('SELECT * FROM billing_months WHERE id = ?').get(billingMonthId);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST record event (tenant in/out)
router.post('/events', (req, res) => {
  try {
    const { billing_month_id, event_type, tenant_id, meter_reading, event_date, notes } = req.body;
    if (!billing_month_id || !event_type || !meter_reading || !event_date) {
      return res.status(400).json({ error: 'billing_month_id, event_type, meter_reading, and event_date are required' });
    }

    // Ownership check: tenants can only record their own in/out events. Admin can record for anyone.
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (loggedInTenantId && (event_type === 'TENANT_IN' || event_type === 'TENANT_OUT')) {
      const user = db.prepare('SELECT is_admin FROM tenants WHERE id = ?').get(loggedInTenantId);
      if (!user || (!user.is_admin && parseInt(loggedInTenantId) !== parseInt(tenant_id))) {
        return res.status(403).json({ error: 'You can only record your own in/out status' });
      }
    }

    // Verify billing month exists and is not closed
    const month = db.prepare('SELECT * FROM billing_months WHERE id = ?').get(billing_month_id);
    if (!month) return res.status(404).json({ error: 'Billing month not found' });
    if (month.is_closed) return res.status(400).json({ error: 'Billing month is already closed' });

    // Record the event
    const result = db.prepare(
      'INSERT INTO events (billing_month_id, event_type, tenant_id, meter_reading, event_date, notes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(billing_month_id, event_type, tenant_id || null, meter_reading, event_date, notes || null);

    // Update tenant month status
    if (tenant_id && (event_type === 'TENANT_OUT' || event_type === 'TENANT_IN')) {
      const isPresent = event_type === 'TENANT_IN' ? 1 : 0;
      const existingStatus = db.prepare('SELECT * FROM tenant_month_status WHERE billing_month_id = ? AND tenant_id = ?').get(billing_month_id, tenant_id);
      
      if (existingStatus) {
        db.prepare('UPDATE tenant_month_status SET is_present = ? WHERE billing_month_id = ? AND tenant_id = ?').run(isPresent, billing_month_id, tenant_id);
      } else {
        db.prepare('INSERT INTO tenant_month_status (billing_month_id, tenant_id, is_present) VALUES (?, ?, ?)').run(billing_month_id, tenant_id, isPresent);
      }

      // Also update tenant's global active status
      db.prepare('UPDATE tenants SET is_active = ? WHERE id = ?').run(isPresent, tenant_id);
    }

    // Recalculate bills for this month
    calculateBills(billing_month_id);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT close billing month
router.put('/months/:id/close', (req, res) => {
  try {
    const { end_reading, end_date } = req.body;
    if (end_reading === undefined) {
      return res.status(400).json({ error: 'end_reading is required' });
    }

    const month = db.prepare('SELECT * FROM billing_months WHERE id = ?').get(req.params.id);
    if (!month) return res.status(404).json({ error: 'Billing month not found' });
    if (month.is_closed) return res.status(400).json({ error: 'Month is already closed' });

    // Record MONTH_END event
    const eventDate = end_date || month.month + '-28';
    db.prepare('INSERT INTO events (billing_month_id, event_type, meter_reading, event_date) VALUES (?, ?, ?, ?)').run(req.params.id, 'MONTH_END', end_reading, eventDate);

    // Update billing month
    db.prepare('UPDATE billing_months SET end_reading = ?, is_closed = 1 WHERE id = ?').run(end_reading, req.params.id);

    // Calculate final bills
    calculateBills(req.params.id);

    const updated = db.prepare('SELECT * FROM billing_months WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE billing month (Admin only)
router.delete('/months/:id', (req, res) => {
  try {
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (!loggedInTenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const user = db.prepare('SELECT is_admin FROM tenants WHERE id = ?').get(loggedInTenantId);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Only Admin can delete billing months' });
    }

    db.prepare('DELETE FROM billing_months WHERE id = ?').run(req.params.id);
    res.json({ message: 'Billing month deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET calculate/recalculate bills for a month
router.get('/months/:id/calculate', (req, res) => {
  try {
    const result = calculateBills(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE event
router.delete('/events/:id', (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Don't allow deleting MONTH_START events
    if (event.event_type === 'MONTH_START') {
      return res.status(400).json({ error: 'Cannot delete month start event' });
    }

    // Ownership check: tenants can only delete their own events. Admin can delete any event.
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (loggedInTenantId && event.tenant_id) {
      const user = db.prepare('SELECT is_admin FROM tenants WHERE id = ?').get(loggedInTenantId);
      if (!user || (!user.is_admin && parseInt(loggedInTenantId) !== parseInt(event.tenant_id))) {
        return res.status(403).json({ error: 'You can only delete your own events' });
      }
    }

    // If it's a tenant event, revert the status
    if (event.tenant_id && (event.event_type === 'TENANT_OUT' || event.event_type === 'TENANT_IN')) {
      const revertPresent = event.event_type === 'TENANT_OUT' ? 1 : 0;
      db.prepare('UPDATE tenant_month_status SET is_present = ? WHERE billing_month_id = ? AND tenant_id = ?').run(revertPresent, event.billing_month_id, event.tenant_id);
      db.prepare('UPDATE tenants SET is_active = ? WHERE id = ?').run(revertPresent, event.tenant_id);
    }

    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);

    // If it was a MONTH_END event, reopen the month
    if (event.event_type === 'MONTH_END') {
      db.prepare('UPDATE billing_months SET end_reading = NULL, is_closed = 0 WHERE id = ?').run(event.billing_month_id);
    }

    // Recalculate bills
    calculateBills(event.billing_month_id);

    res.json({ message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Calculate bills for a billing month using segment-based splitting.
 * Each segment is between two consecutive events. The bill for each segment
 * is split equally among tenants present during that segment.
 */
function calculateBills(billingMonthId) {
  const month = db.prepare('SELECT * FROM billing_months WHERE id = ?').get(billingMonthId);
  if (!month) throw new Error('Billing month not found');

  // Get all events sorted by date and id
  const events = db.prepare(`
    SELECT e.*, t.name as tenant_name 
    FROM events e 
    LEFT JOIN tenants t ON e.tenant_id = t.id 
    WHERE e.billing_month_id = ? 
    ORDER BY e.meter_reading ASC, 
             CASE WHEN e.event_type = 'MONTH_START' THEN 0 
                  WHEN e.event_type = 'MONTH_END' THEN 2 
                  ELSE 1 END ASC, 
             e.id ASC
  `).all(billingMonthId);

  if (events.length === 0) return { billShares: [] };

  // Get all tenants for this month
  const tenantStatuses = db.prepare(`
    SELECT tms.*, t.name as tenant_name 
    FROM tenant_month_status tms 
    JOIN tenants t ON tms.tenant_id = t.id 
    WHERE tms.billing_month_id = ?
  `).all(billingMonthId);

  // Track present tenants — determine initial presence based on first event
  const presentTenants = new Set();
  
  for (const ts of tenantStatuses) {
    const firstEvent = events.find(e => e.tenant_id === ts.tenant_id);
    if (firstEvent) {
      if (firstEvent.event_type === 'TENANT_OUT') {
        presentTenants.add(ts.tenant_id);
      }
    } else {
      if (ts.is_present) {
        presentTenants.add(ts.tenant_id);
      }
    }
  }
  const tenantUnits = {};
  const tenantAmounts = {};

  // Initialize all tenants
  for (const ts of tenantStatuses) {
    tenantUnits[ts.tenant_id] = 0;
    tenantAmounts[ts.tenant_id] = 0;
  }

  // Process segments between consecutive events
  for (let i = 0; i < events.length - 1; i++) {
    const currentEvent = events[i];
    const nextEvent = events[i + 1];

    // After processing the current event, update presence
    if (currentEvent.event_type === 'TENANT_OUT' && currentEvent.tenant_id) {
      presentTenants.delete(currentEvent.tenant_id);
    } else if (currentEvent.event_type === 'TENANT_IN' && currentEvent.tenant_id) {
      presentTenants.add(currentEvent.tenant_id);
    }

    // Calculate units in this segment
    const segmentUnits = nextEvent.meter_reading - currentEvent.meter_reading;
    if (segmentUnits <= 0 || presentTenants.size === 0) continue;

    // Split equally among present tenants
    const unitsPerTenant = segmentUnits / presentTenants.size;
    const amountPerTenant = unitsPerTenant * month.rate_per_unit;

    for (const tenantId of presentTenants) {
      tenantUnits[tenantId] = (tenantUnits[tenantId] || 0) + unitsPerTenant;
      tenantAmounts[tenantId] = (tenantAmounts[tenantId] || 0) + amountPerTenant;
    }
  }

  // Handle last event for TENANT_OUT/TENANT_IN (only relevant for open months)
  const lastEvent = events[events.length - 1];
  if (lastEvent.event_type === 'TENANT_OUT' && lastEvent.tenant_id) {
    presentTenants.delete(lastEvent.tenant_id);
  } else if (lastEvent.event_type === 'TENANT_IN' && lastEvent.tenant_id) {
    presentTenants.add(lastEvent.tenant_id);
  }

  // Save bill shares
  db.prepare('DELETE FROM bill_shares WHERE billing_month_id = ?').run(billingMonthId);

  const insertShare = db.prepare('INSERT INTO bill_shares (billing_month_id, tenant_id, total_units, total_amount) VALUES (?, ?, ?, ?)');
  const billShares = [];

  for (const ts of tenantStatuses) {
    const units = Math.round((tenantUnits[ts.tenant_id] || 0) * 100) / 100;
    const amount = Math.round((tenantAmounts[ts.tenant_id] || 0) * 100) / 100;
    insertShare.run(billingMonthId, ts.tenant_id, units, amount);
    billShares.push({
      tenant_id: ts.tenant_id,
      tenant_name: ts.tenant_name,
      total_units: units,
      total_amount: amount
    });
  }

  return { billShares, totalUnits: month.end_reading ? month.end_reading - month.start_reading : null };
}

module.exports = router;
