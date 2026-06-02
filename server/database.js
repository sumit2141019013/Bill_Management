const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'bills.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    password TEXT,
    is_active INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0,
    joined_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS billing_months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    start_reading REAL NOT NULL,
    end_reading REAL,
    rate_per_unit REAL DEFAULT 10,
    is_closed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    billing_month_id INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('TENANT_OUT', 'TENANT_IN', 'MONTH_START', 'MONTH_END')),
    tenant_id INTEGER,
    meter_reading REAL NOT NULL,
    event_date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (billing_month_id) REFERENCES billing_months(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS bill_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    billing_month_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    total_units REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (billing_month_id) REFERENCES billing_months(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE(billing_month_id, tenant_id)
  );

  CREATE TABLE IF NOT EXISTS tenant_month_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    billing_month_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    is_present INTEGER DEFAULT 1,
    FOREIGN KEY (billing_month_id) REFERENCES billing_months(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    UNIQUE(billing_month_id, tenant_id)
  );
`);

// Migration: add phone and password columns if they don't exist (for existing DBs)
try {
  db.prepare("SELECT phone FROM tenants LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE tenants ADD COLUMN phone TEXT");
  console.log('📦 Migrated: added phone column to tenants');
}
try {
  db.prepare("SELECT password FROM tenants LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE tenants ADD COLUMN password TEXT");
  console.log('📦 Migrated: added password column to tenants');
}
try {
  db.prepare("SELECT is_admin FROM tenants LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE tenants ADD COLUMN is_admin INTEGER DEFAULT 0");
  console.log('📦 Migrated: added is_admin column to tenants');
}

// Seed default 4 tenants if none exist
const rowCount = db.prepare('SELECT COUNT(*) as count FROM tenants').get();
if (rowCount.count === 0) {
  const defaultTenants = [
    { name: 'Tenant A', phone: '1111111111', password: '1234', joined_date: new Date().toISOString().split('T')[0] },
    { name: 'Tenant B', phone: '2222222222', password: '1234', joined_date: new Date().toISOString().split('T')[0] },
    { name: 'Tenant C', phone: '3333333333', password: '1234', joined_date: new Date().toISOString().split('T')[0] },
    { name: 'Tenant D', phone: '4444444444', password: '1234', joined_date: new Date().toISOString().split('T')[0] }
  ];

  const insertTenant = db.prepare('INSERT INTO tenants (name, phone, password, joined_date) VALUES (?, ?, ?, ?)');
  for (const tenant of defaultTenants) {
    insertTenant.run(tenant.name, tenant.phone, tenant.password, tenant.joined_date);
  }
  console.log('🌱 Seeded 4 default tenants (Tenant A, B, C, D) with default password: 1234');
}

// Seed default Admin user if it doesn't exist
const adminUser = db.prepare("SELECT id FROM tenants WHERE name = 'Admin' AND is_admin = 1").get();
if (!adminUser) {
  db.prepare("INSERT INTO tenants (name, phone, password, is_active, is_admin, joined_date) VALUES ('Admin', 'admin', 'admin2026', 0, 1, ?)").run(new Date().toISOString().split('T')[0]);
  console.log('👑 Seeded default Admin user (Name: Admin, Phone: admin, Password: admin2026)');
}

module.exports = db;
