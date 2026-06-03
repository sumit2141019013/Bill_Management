require('dotenv').config();
const path = require('path');
const fs = require('fs');

let pool;
let query;
let initDatabase;

if (process.env.DATABASE_URL) {
  console.log('🔗 Using PostgreSQL Database');
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  query = async function(text, params) {
    return pool.query(text, params);
  };

  initDatabase = async function() {
    const client = await pool.connect();
    try {
      // Create tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT,
          password TEXT,
          is_active INTEGER DEFAULT 1,
          is_admin INTEGER DEFAULT 0,
          joined_date TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS billing_months (
          id SERIAL PRIMARY KEY,
          month TEXT NOT NULL UNIQUE,
          start_reading DOUBLE PRECISION NOT NULL,
          end_reading DOUBLE PRECISION,
          rate_per_unit DOUBLE PRECISION DEFAULT 10,
          is_closed INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          billing_month_id INTEGER NOT NULL REFERENCES billing_months(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL CHECK(event_type IN ('TENANT_OUT', 'TENANT_IN', 'MONTH_START', 'MONTH_END')),
          tenant_id INTEGER REFERENCES tenants(id),
          meter_reading DOUBLE PRECISION NOT NULL,
          event_date TEXT NOT NULL,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS bill_shares (
          id SERIAL PRIMARY KEY,
          billing_month_id INTEGER NOT NULL REFERENCES billing_months(id) ON DELETE CASCADE,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id),
          total_units DOUBLE PRECISION DEFAULT 0,
          total_amount DOUBLE PRECISION DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(billing_month_id, tenant_id)
        );

        CREATE TABLE IF NOT EXISTS tenant_month_status (
          id SERIAL PRIMARY KEY,
          billing_month_id INTEGER NOT NULL REFERENCES billing_months(id) ON DELETE CASCADE,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id),
          is_present INTEGER DEFAULT 1,
          UNIQUE(billing_month_id, tenant_id)
        );
      `);

      // Seed default 4 tenants if none exist
      const rowCount = await client.query('SELECT COUNT(*) as count FROM tenants');
      if (parseInt(rowCount.rows[0].count) === 0) {
        const today = new Date().toISOString().split('T')[0];
        const defaultTenants = [
          { name: 'Tenant A', phone: '1111111111', password: '1234', joined_date: today },
          { name: 'Tenant B', phone: '2222222222', password: '1234', joined_date: today },
          { name: 'Tenant C', phone: '3333333333', password: '1234', joined_date: today },
          { name: 'Tenant D', phone: '4444444444', password: '1234', joined_date: today },
        ];

        for (const tenant of defaultTenants) {
          await client.query(
            'INSERT INTO tenants (name, phone, password, joined_date) VALUES ($1, $2, $3, $4)',
            [tenant.name, tenant.phone, tenant.password, tenant.joined_date]
          );
        }
        console.log('🌱 Seeded 4 default tenants (Tenant A, B, C, D) with default password: 1234');
      }

      // Seed default Admin user if it doesn't exist
      const adminCheck = await client.query("SELECT id FROM tenants WHERE name = 'Admin' AND is_admin = 1");
      if (adminCheck.rows.length === 0) {
        const today = new Date().toISOString().split('T')[0];
        await client.query(
          "INSERT INTO tenants (name, phone, password, is_active, is_admin, joined_date) VALUES ('Admin', 'admin', 'admin2026', 0, 1, $1)",
          [today]
        );
        console.log('👑 Seeded default Admin user (Name: Admin, Phone: admin, Password: admin2026)');
      }

      console.log('✅ PostgreSQL Database initialized successfully');
    } catch (err) {
      console.error('❌ PostgreSQL Database initialization error:', err.message);
      throw err;
    } finally {
      client.release();
    }
  };
} else {
  console.log('🗄️ Using local SQLite Database (fallback)');
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'bills.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  pool = {
    connect: async () => ({
      query: async (text, params) => query(text, params),
      release: () => {}
    })
  };

  query = async function(text, params = []) {
    let sqliteText = text.replace(/\$\d+/g, '?');
    const stmt = db.prepare(sqliteText);
    const isSelect = sqliteText.trim().toUpperCase().startsWith('SELECT');
    const isReturning = sqliteText.toUpperCase().includes('RETURNING');

    if (isSelect || isReturning) {
      const rows = stmt.all(...params);
      return { rows, rowCount: rows.length };
    } else {
      const info = stmt.run(...params);
      return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
    }
  };

  initDatabase = async function() {
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
        billing_month_id INTEGER NOT NULL REFERENCES billing_months(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK(event_type IN ('TENANT_OUT', 'TENANT_IN', 'MONTH_START', 'MONTH_END')),
        tenant_id INTEGER REFERENCES tenants(id),
        meter_reading REAL NOT NULL,
        event_date TEXT NOT NULL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS bill_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        billing_month_id INTEGER NOT NULL REFERENCES billing_months(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        total_units REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(billing_month_id, tenant_id)
      );

      CREATE TABLE IF NOT EXISTS tenant_month_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        billing_month_id INTEGER NOT NULL REFERENCES billing_months(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        is_present INTEGER DEFAULT 1,
        UNIQUE(billing_month_id, tenant_id)
      );
    `);
    
    const rowCount = await query('SELECT COUNT(*) as count FROM tenants');
    if (parseInt(rowCount.rows[0].count) === 0) {
      const today = new Date().toISOString().split('T')[0];
      const defaultTenants = [
        { name: 'Tenant A', phone: '1111111111', password: '1234', joined_date: today },
        { name: 'Tenant B', phone: '2222222222', password: '1234', joined_date: today },
        { name: 'Tenant C', phone: '3333333333', password: '1234', joined_date: today },
        { name: 'Tenant D', phone: '4444444444', password: '1234', joined_date: today },
      ];

      for (const tenant of defaultTenants) {
        await query(
          'INSERT INTO tenants (name, phone, password, joined_date) VALUES ($1, $2, $3, $4)',
          [tenant.name, tenant.phone, tenant.password, tenant.joined_date]
        );
      }
      console.log('🌱 Seeded 4 default tenants (Tenant A, B, C, D) with default password: 1234');
    }

    const adminCheck = await query("SELECT id FROM tenants WHERE name = 'Admin' AND is_admin = 1");
    if (adminCheck.rows.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      await query(
        "INSERT INTO tenants (name, phone, password, is_active, is_admin, joined_date) VALUES ('Admin', 'admin', 'admin2026', 0, 1, $1)",
        [today]
      );
      console.log('👑 Seeded default Admin user (Name: Admin, Phone: admin, Password: admin2026)');
    }

    console.log('✅ SQLite Database initialized successfully');
  };
}

module.exports = { query, pool, initDatabase };
