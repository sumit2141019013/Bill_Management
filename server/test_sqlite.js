const Database = require('better-sqlite3');
const db = new Database(':memory:');

db.exec(`CREATE TABLE tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);

const text = 'INSERT INTO tenants (name) VALUES ($1) RETURNING id';
const params = ['Test'];

let sqliteText = text.replace(/\$\d+/g, '?');

const stmt = db.prepare(sqliteText);
const rows = stmt.all(...params);
console.log(rows);
