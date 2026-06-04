const express = require('express');
const router = express.Router();
const multer = require('multer');
const { query } = require('../database');
const { uploadImage, extractMeterReading, verifyReading } = require('../services/ocr');

const upload = multer({ storage: multer.memoryStorage() });

// GET all billing months
router.get('/months', async (req, res) => {
  try {
    const result = await query(`
      SELECT bm.*, 
        (SELECT COUNT(*) FROM tenant_month_status tms WHERE tms.billing_month_id = bm.id AND tms.is_present = 1) as active_tenants
      FROM billing_months bm 
      ORDER BY bm.month DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single billing month with details
router.get('/months/:id', async (req, res) => {
  try {
    const monthResult = await query('SELECT * FROM billing_months WHERE id = $1', [req.params.id]);
    if (monthResult.rows.length === 0) return res.status(404).json({ error: 'Billing month not found' });
    const month = monthResult.rows[0];

    const eventsResult = await query(`
      SELECT e.*, t.name as tenant_name 
      FROM events e 
      LEFT JOIN tenants t ON e.tenant_id = t.id 
      WHERE e.billing_month_id = $1 
      ORDER BY e.meter_reading ASC, 
               CASE WHEN e.event_type = 'MONTH_START' THEN 0 
                    WHEN e.event_type = 'MONTH_END' THEN 2 
                    ELSE 1 END ASC, 
               e.id ASC
    `, [req.params.id]);

    const tenantStatusResult = await query(`
      SELECT tms.*, t.name as tenant_name 
      FROM tenant_month_status tms 
      JOIN tenants t ON tms.tenant_id = t.id 
      WHERE tms.billing_month_id = $1
    `, [req.params.id]);

    const billSharesResult = await query(`
      SELECT bs.*, t.name as tenant_name 
      FROM bill_shares bs 
      JOIN tenants t ON bs.tenant_id = t.id 
      WHERE bs.billing_month_id = $1
    `, [req.params.id]);

    res.json({
      ...month,
      events: eventsResult.rows,
      tenantStatus: tenantStatusResult.rows,
      billShares: billSharesResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST start new billing month
router.post('/months', upload.single('meter_image'), async (req, res) => {
  try {
    let { month, start_reading, rate_per_unit } = req.body;
    if (start_reading !== undefined) start_reading = parseFloat(start_reading);
    if (rate_per_unit !== undefined) rate_per_unit = parseFloat(rate_per_unit);

    if (!month || start_reading === undefined) {
      return res.status(400).json({ error: 'Month and start_reading are required' });
    }

    // Check if month already exists
    const existing = await query('SELECT * FROM billing_months WHERE month = $1', [month]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Billing month already exists' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Meter image/photo is required' });
    }

    let meter_image_url = null;
    let ai_meter_reading = null;

    try {
      // 1. Upload the image to Cloudinary (or local fallback)
      meter_image_url = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype, req);

      // 2. Extract reading via Gemini and BLOCK if mismatch or unreadable
      const ocrResult = await extractMeterReading(req.file.buffer, req.file.mimetype);
      if (ocrResult) {
        if (ocrResult.bypass) {
          console.log('Gemini OCR bypassed:', ocrResult.reason);
        } else if (ocrResult.error) {
          return res.status(400).json({ error: `AI verification failed: ${ocrResult.error}` });
        } else if (ocrResult.reading === null || ocrResult.reading === undefined) {
          return res.status(400).json({
            error: 'AI could not read the meter display clearly. Please ensure the photo is clear, well-lit, and shows the meter screen clearly.'
          });
        } else {
          ai_meter_reading = ocrResult.reading;
          const verification = verifyReading(start_reading, ocrResult.reading);
          if (!verification.verified) {
            return res.status(400).json({
              error: `Meter reading mismatch! AI extracted ${ocrResult.reading} from the photo, but you entered ${start_reading}. Please re-check the meter and try again.`,
              ai_reading: ocrResult.reading,
              user_reading: start_reading
            });
          }
        }
      }
    } catch (err) {
      console.error('Error processing image/OCR:', err.message);
      return res.status(400).json({ error: `Image processing or AI verification failed: ${err.message}` });
    }

    const rate = rate_per_unit || 10;
    const result = await query(
      'INSERT INTO billing_months (month, start_reading, rate_per_unit) VALUES ($1, $2, $3) RETURNING id',
      [month, start_reading, rate]
    );
    const billingMonthId = result.rows[0].id;

    // Create MONTH_START event
    await query(
      'INSERT INTO events (billing_month_id, event_type, meter_reading, event_date, meter_image_url, ai_meter_reading) VALUES ($1, $2, $3, $4, $5, $6)',
      [billingMonthId, 'MONTH_START', start_reading, month + '-01', meter_image_url, ai_meter_reading]
    );

    // Add all active tenants (excluding admin) to this month
    const activeTenants = await query('SELECT * FROM tenants WHERE is_active = 1 AND is_admin = 0');
    for (const tenant of activeTenants.rows) {
      await query(
        'INSERT INTO tenant_month_status (billing_month_id, tenant_id, is_present) VALUES ($1, $2, 1)',
        [billingMonthId, tenant.id]
      );
    }

    const created = await query('SELECT * FROM billing_months WHERE id = $1', [billingMonthId]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST record event (tenant in/out)
router.post('/events', upload.single('meter_image'), async (req, res) => {
  try {
    let { billing_month_id, event_type, tenant_id, meter_reading, event_date, notes } = req.body;
    
    // Parse numeric fields because multer form-data returns them as strings
    if (billing_month_id) billing_month_id = parseInt(billing_month_id, 10);
    if (tenant_id) tenant_id = parseInt(tenant_id, 10) || null;
    if (meter_reading) meter_reading = parseFloat(meter_reading);

    if (!billing_month_id || !event_type || meter_reading === undefined || !event_date) {
      return res.status(400).json({ error: 'billing_month_id, event_type, meter_reading, and event_date are required' });
    }

    // Ownership check: tenants can only record their own in/out events. Admin can record for anyone.
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (loggedInTenantId && (event_type === 'TENANT_IN' || event_type === 'TENANT_OUT')) {
      const userResult = await query('SELECT is_admin FROM tenants WHERE id = $1', [loggedInTenantId]);
      const user = userResult.rows[0];
      if (!user || (!user.is_admin && parseInt(loggedInTenantId) !== parseInt(tenant_id))) {
        return res.status(403).json({ error: 'You can only record your own in/out status' });
      }
    }

    // Verify billing month exists and is not closed
    const monthResult = await query('SELECT * FROM billing_months WHERE id = $1', [billing_month_id]);
    if (monthResult.rows.length === 0) return res.status(404).json({ error: 'Billing month not found' });
    if (monthResult.rows[0].is_closed) return res.status(400).json({ error: 'Billing month is already closed' });

    // Duplicate event guard: prevent recording the same in/out status twice
    if (tenant_id && (event_type === 'TENANT_OUT' || event_type === 'TENANT_IN')) {
      const statusResult = await query(
        'SELECT is_present FROM tenant_month_status WHERE billing_month_id = $1 AND tenant_id = $2',
        [billing_month_id, tenant_id]
      );
      if (statusResult.rows.length > 0) {
        const currentlyPresent = statusResult.rows[0].is_present;
        if (event_type === 'TENANT_OUT' && !currentlyPresent) {
          return res.status(400).json({ error: 'This tenant is already marked as OUT for this month' });
        }
        if (event_type === 'TENANT_IN' && currentlyPresent) {
          return res.status(400).json({ error: 'This tenant is already marked as IN for this month' });
        }
      }
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Meter image/photo is required' });
    }

    let meter_image_url = null;
    let ai_meter_reading = null;

    try {
      // 1. Upload the image to Cloudinary (or local fallback)
      meter_image_url = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype, req);

      // 2. Extract reading via Gemini and BLOCK if mismatch or unreadable
      const ocrResult = await extractMeterReading(req.file.buffer, req.file.mimetype);
      if (ocrResult) {
        if (ocrResult.bypass) {
          console.log('Gemini OCR bypassed:', ocrResult.reason);
        } else if (ocrResult.error) {
          return res.status(400).json({ error: `AI verification failed: ${ocrResult.error}` });
        } else if (ocrResult.reading === null || ocrResult.reading === undefined) {
          return res.status(400).json({
            error: 'AI could not read the meter display clearly. Please ensure the photo is clear, well-lit, and shows the meter screen clearly.'
          });
        } else {
          ai_meter_reading = ocrResult.reading;
          const verification = verifyReading(meter_reading, ocrResult.reading);
          if (!verification.verified) {
            return res.status(400).json({
              error: `Meter reading mismatch! AI extracted ${ocrResult.reading} from the photo, but you entered ${meter_reading}. Please re-check the meter and try again.`,
              ai_reading: ocrResult.reading,
              user_reading: meter_reading
            });
          }
        }
      }
    } catch (err) {
      console.error('Error processing image/OCR:', err.message);
      return res.status(400).json({ error: `Image processing or AI verification failed: ${err.message}` });
    }

    // Record the event
    const result = await query(
      'INSERT INTO events (billing_month_id, event_type, tenant_id, meter_reading, event_date, notes, meter_image_url, ai_meter_reading) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [billing_month_id, event_type, tenant_id || null, meter_reading, event_date, notes || null, meter_image_url, ai_meter_reading]
    );

    // Update tenant month status
    if (tenant_id && (event_type === 'TENANT_OUT' || event_type === 'TENANT_IN')) {
      const isPresent = event_type === 'TENANT_IN' ? 1 : 0;
      const existingStatus = await query(
        'SELECT * FROM tenant_month_status WHERE billing_month_id = $1 AND tenant_id = $2',
        [billing_month_id, tenant_id]
      );

      if (existingStatus.rows.length > 0) {
        await query(
          'UPDATE tenant_month_status SET is_present = $1 WHERE billing_month_id = $2 AND tenant_id = $3',
          [isPresent, billing_month_id, tenant_id]
        );
      } else {
        await query(
          'INSERT INTO tenant_month_status (billing_month_id, tenant_id, is_present) VALUES ($1, $2, $3)',
          [billing_month_id, tenant_id, isPresent]
        );
      }

      // Also update tenant's global active status
      await query('UPDATE tenants SET is_active = $1 WHERE id = $2', [isPresent, tenant_id]);
    }

    // Recalculate bills for this month
    await calculateBills(billing_month_id);

    const event = await query('SELECT * FROM events WHERE id = $1', [result.rows[0].id]);
    res.status(201).json(event.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT close billing month
router.put('/months/:id/close', upload.single('meter_image'), async (req, res) => {
  try {
    let { end_reading, end_date } = req.body;
    if (end_reading !== undefined) end_reading = parseFloat(end_reading);

    if (end_reading === undefined) {
      return res.status(400).json({ error: 'end_reading is required' });
    }

    const monthResult = await query('SELECT * FROM billing_months WHERE id = $1', [req.params.id]);
    if (monthResult.rows.length === 0) return res.status(404).json({ error: 'Billing month not found' });
    const month = monthResult.rows[0];
    if (month.is_closed) return res.status(400).json({ error: 'Month is already closed' });

    if (!req.file) {
      return res.status(400).json({ error: 'Meter image/photo is required' });
    }

    let meter_image_url = null;
    let ai_meter_reading = null;

    try {
      // 1. Upload the image to Cloudinary (or local fallback)
      meter_image_url = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype, req);

      // 2. Extract reading via Gemini and BLOCK if mismatch or unreadable
      const ocrResult = await extractMeterReading(req.file.buffer, req.file.mimetype);
      if (ocrResult) {
        if (ocrResult.bypass) {
          console.log('Gemini OCR bypassed:', ocrResult.reason);
        } else if (ocrResult.error) {
          return res.status(400).json({ error: `AI verification failed: ${ocrResult.error}` });
        } else if (ocrResult.reading === null || ocrResult.reading === undefined) {
          return res.status(400).json({
            error: 'AI could not read the meter display clearly. Please ensure the photo is clear, well-lit, and shows the meter screen clearly.'
          });
        } else {
          ai_meter_reading = ocrResult.reading;
          const verification = verifyReading(end_reading, ocrResult.reading);
          if (!verification.verified) {
            return res.status(400).json({
              error: `Meter reading mismatch! AI extracted ${ocrResult.reading} from the photo, but you entered ${end_reading}. Please re-check the meter and try again.`,
              ai_reading: ocrResult.reading,
              user_reading: end_reading
            });
          }
        }
      }
    } catch (err) {
      console.error('Error processing image/OCR:', err.message);
      return res.status(400).json({ error: `Image processing or AI verification failed: ${err.message}` });
    }

    // Record MONTH_END event
    const eventDate = end_date || month.month + '-28';
    await query(
      'INSERT INTO events (billing_month_id, event_type, meter_reading, event_date, meter_image_url, ai_meter_reading) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.params.id, 'MONTH_END', end_reading, eventDate, meter_image_url, ai_meter_reading]
    );

    // Update billing month
    await query('UPDATE billing_months SET end_reading = $1, is_closed = 1 WHERE id = $2', [end_reading, req.params.id]);

    // Calculate final bills
    await calculateBills(req.params.id);

    const updated = await query('SELECT * FROM billing_months WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE billing month (Admin only)
router.delete('/months/:id', async (req, res) => {
  try {
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (!loggedInTenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userResult = await query('SELECT is_admin FROM tenants WHERE id = $1', [loggedInTenantId]);
    const user = userResult.rows[0];
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Only Admin can delete billing months' });
    }

    await query('DELETE FROM billing_months WHERE id = $1', [req.params.id]);
    res.json({ message: 'Billing month deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET calculate/recalculate bills for a month
router.get('/months/:id/calculate', async (req, res) => {
  try {
    const result = await calculateBills(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE event
router.delete('/events/:id', async (req, res) => {
  try {
    const eventResult = await query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (eventResult.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventResult.rows[0];

    // Don't allow deleting MONTH_START events
    if (event.event_type === 'MONTH_START') {
      return res.status(400).json({ error: 'Cannot delete month start event' });
    }

    // Ownership check: tenants can only delete their own events. Admin can delete any event.
    const loggedInTenantId = req.headers['x-tenant-id'];
    if (loggedInTenantId && event.tenant_id) {
      const userResult = await query('SELECT is_admin FROM tenants WHERE id = $1', [loggedInTenantId]);
      const user = userResult.rows[0];
      if (!user || (!user.is_admin && parseInt(loggedInTenantId) !== parseInt(event.tenant_id))) {
        return res.status(403).json({ error: 'You can only delete your own events' });
      }
    }

    // If it's a tenant event, revert the status
    if (event.tenant_id && (event.event_type === 'TENANT_OUT' || event.event_type === 'TENANT_IN')) {
      const revertPresent = event.event_type === 'TENANT_OUT' ? 1 : 0;
      await query(
        'UPDATE tenant_month_status SET is_present = $1 WHERE billing_month_id = $2 AND tenant_id = $3',
        [revertPresent, event.billing_month_id, event.tenant_id]
      );
      await query('UPDATE tenants SET is_active = $1 WHERE id = $2', [revertPresent, event.tenant_id]);
    }

    await query('DELETE FROM events WHERE id = $1', [req.params.id]);

    // If it was a MONTH_END event, reopen the month
    if (event.event_type === 'MONTH_END') {
      await query('UPDATE billing_months SET end_reading = NULL, is_closed = 0 WHERE id = $1', [event.billing_month_id]);
    }

    // Recalculate bills
    await calculateBills(event.billing_month_id);

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
async function calculateBills(billingMonthId) {
  const monthResult = await query('SELECT * FROM billing_months WHERE id = $1', [billingMonthId]);
  if (monthResult.rows.length === 0) throw new Error('Billing month not found');
  const month = monthResult.rows[0];

  // Get all events sorted by date and id
  const eventsResult = await query(`
    SELECT e.*, t.name as tenant_name 
    FROM events e 
    LEFT JOIN tenants t ON e.tenant_id = t.id 
    WHERE e.billing_month_id = $1 
    ORDER BY e.meter_reading ASC, 
             CASE WHEN e.event_type = 'MONTH_START' THEN 0 
                  WHEN e.event_type = 'MONTH_END' THEN 2 
                  ELSE 1 END ASC, 
             e.id ASC
  `, [billingMonthId]);
  const events = eventsResult.rows;

  if (events.length === 0) return { billShares: [] };

  // Get all tenants for this month
  const tenantStatusResult = await query(`
    SELECT tms.*, t.name as tenant_name 
    FROM tenant_month_status tms 
    JOIN tenants t ON tms.tenant_id = t.id 
    WHERE tms.billing_month_id = $1
  `, [billingMonthId]);
  const tenantStatuses = tenantStatusResult.rows;

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

  // Save bill shares — delete old then insert new
  await query('DELETE FROM bill_shares WHERE billing_month_id = $1', [billingMonthId]);

  const billShares = [];
  for (const ts of tenantStatuses) {
    const units = Math.round((tenantUnits[ts.tenant_id] || 0) * 100) / 100;
    const amount = Math.round((tenantAmounts[ts.tenant_id] || 0) * 100) / 100;
    await query(
      'INSERT INTO bill_shares (billing_month_id, tenant_id, total_units, total_amount) VALUES ($1, $2, $3, $4)',
      [billingMonthId, ts.tenant_id, units, amount]
    );
    billShares.push({
      tenant_id: ts.tenant_id,
      tenant_name: ts.tenant_name,
      total_units: units,
      total_amount: amount,
    });
  }

  return { billShares, totalUnits: month.end_reading ? month.end_reading - month.start_reading : null };
}

module.exports = router;
