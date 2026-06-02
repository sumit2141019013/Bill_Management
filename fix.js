const db = require('./server/database.js');
const fs = require('fs');

const months = db.prepare('SELECT id FROM billing_months').all();
console.log('Months to fix:', months);
for (const m of months) {
  fetch('http://localhost:5000/api/billing/months/' + m.id + '/calculate')
    .then(res => res.json())
    .then(data => console.log('Fixed month ' + m.id, data))
    .catch(err => console.error(err));
}
