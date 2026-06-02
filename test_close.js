const db = require('./server/database.js');
const router = require('./server/routes/billing.js');

// Reset db for clean test
db.exec('DELETE FROM events; DELETE FROM tenant_month_status; DELETE FROM bill_shares; DELETE FROM billing_months;');

// Start month
db.prepare('INSERT INTO billing_months (id, month, start_reading, rate_per_unit) VALUES (2, "2026-06", 4392, 10)').run();
db.prepare('INSERT INTO tenant_month_status (billing_month_id, tenant_id, is_present) VALUES (2, 1, 0), (2, 2, 0), (2, 3, 1), (2, 4, 1)').run();

// Insert events
const events = [
  { type: 'MONTH_START', t: null, m: 4392 },
  { type: 'TENANT_OUT', t: 4, m: 4499 },
  { type: 'TENANT_IN', t: 4, m: 4538 },
  { type: 'TENANT_OUT', t: 1, m: 4578 },
  { type: 'TENANT_OUT', t: 2, m: 4669 }
];

for (const e of events) {
  db.prepare('INSERT INTO events (billing_month_id, event_type, tenant_id, meter_reading, event_date) VALUES (2, ?, ?, ?, "2026-06-15")').run(e.type, e.t, e.m);
}

// Calculate open month
fetch('http://localhost:5000/api/billing/months/2/calculate')
  .then(res => res.json())
  .then(data => console.log('Open Month:', data));

setTimeout(() => {
  // Close month
  fetch('http://localhost:5000/api/billing/months/2/close', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ end_reading: 4674 })
  })
    .then(res => res.json())
    .then(data => {
      console.log('Closed Month end_reading:', data.end_reading);
      fetch('http://localhost:5000/api/billing/months/2')
        .then(res => res.json())
        .then(monthData => {
           console.log('Closed Month Bill Shares:', monthData.billShares);
        });
    });
}, 1000);
