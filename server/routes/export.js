const express = require('express');
const router = express.Router();
const { query } = require('../database');
const XLSX = require('xlsx');

// GET export billing month as Excel
router.get('/excel/:monthId', async (req, res) => {
  try {
    const monthResult = await query('SELECT * FROM billing_months WHERE id = $1', [req.params.monthId]);
    if (monthResult.rows.length === 0) return res.status(404).json({ error: 'Billing month not found' });
    const month = monthResult.rows[0];

    const billSharesResult = await query(`
      SELECT bs.*, t.name as tenant_name 
      FROM bill_shares bs 
      JOIN tenants t ON bs.tenant_id = t.id 
      WHERE bs.billing_month_id = $1
      ORDER BY t.name
    `, [req.params.monthId]);

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
    `, [req.params.monthId]);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Bill Summary - ' + month.month],
      [''],
      ['Start Reading', month.start_reading],
      ['End Reading', month.end_reading || 'Not closed'],
      ['Total Units', month.end_reading ? month.end_reading - month.start_reading : 'N/A'],
      ['Rate per Unit (₹)', month.rate_per_unit],
      ['Status', month.is_closed ? 'Closed' : 'Open'],
      [''],
      ['Tenant-wise Bill Breakdown'],
      ['Tenant Name', 'Units', 'Amount (₹)'],
    ];

    let totalAmount = 0;
    for (const share of billSharesResult.rows) {
      summaryData.push([share.tenant_name, share.total_units, share.total_amount]);
      totalAmount += share.total_amount;
    }
    summaryData.push(['']);
    summaryData.push(['Total', '', totalAmount]);

    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    // Events sheet
    const eventsData = [
      ['Event Timeline'],
      [''],
      ['Date', 'Event Type', 'Tenant', 'Meter Reading', 'Notes']
    ];

    for (const event of eventsResult.rows) {
      eventsData.push([
        event.event_date,
        event.event_type,
        event.tenant_name || '-',
        event.meter_reading,
        event.notes || ''
      ]);
    }

    const ws2 = XLSX.utils.aoa_to_sheet(eventsData);
    ws2['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Events');

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=bill_${month.month}.xlsx`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
