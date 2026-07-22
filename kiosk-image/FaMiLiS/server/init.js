import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function addColumnIfMissing(pool, tableName, columnName, definition) {
  const [[row]] = await pool.query(
    `
    SELECT COUNT(*) AS column_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND column_name = ?
    `,
    [tableName, columnName],
  );

  if (Number(row?.column_count ?? 0) === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

function createPool() {
  // Example: mysql://user:password@localhost:3306/familis_central
  const connectionString =
    process.env.DATABASE_URL || "mysql://root:@localhost:3306/familis_central";

  const url = new URL(connectionString);

  return mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace("/", ""),
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
  });
}

export async function initDb() {
  const pool = createPool();

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch (err) {
      if (attempt === 30) throw err;
      console.log(`MySQL not ready for Node API (${attempt}/30): ${err?.message || err}`);
      await sleep(2000);
    }
  }

  // Run schema.sql (now MySQL dialect) to ensure tables/enums exist
  const schemaPath = path.resolve(__dirname, "../server_database/schema.sql");
  const schemaSql = await readFile(schemaPath, "utf8");
  await pool.query(schemaSql);

  const participantColumns = [
    ["name", "VARCHAR(255) NULL"],
    ["email", "VARCHAR(255) NULL"],
    ["password_hash", "TEXT NULL"],
    ["tester_label", "VARCHAR(50) NULL"],
    ["kiosk_id", "INT NULL"],
    ["contact_number", "VARCHAR(50) NULL"],
    ["gcash_number", "VARCHAR(50) NULL"],
    ["age", "INT NULL"],
    ["gender", "ENUM('male', 'female', 'other') NULL"],
    ["photo_url", "TEXT NULL"],
    ["created_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
  ];

  for (const [columnName, definition] of participantColumns) {
    await addColumnIfMissing(pool, "participants", columnName, definition);
  }

  await pool.query(`
    ALTER TABLE users
    MODIFY role ENUM('staff', 'tester', 'admin') NOT NULL DEFAULT 'tester'
  `);
  await pool.query("UPDATE users SET role = 'tester' WHERE role = 'staff'");
  await pool.query(`
    ALTER TABLE users
    MODIFY role ENUM('tester', 'admin') NOT NULL DEFAULT 'tester'
  `);

  // Seed admin user (plaintext demo password hashed with bcrypt; salt is inside the hash)
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  await pool.query(
    `
    INSERT INTO users (username, email, password_hash, role)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      username = VALUES(username),
      password_hash = VALUES(password_hash);
  `,
    ["admin", "admin@familis.com", adminPasswordHash, "admin"]
  );

  await pool.query(
    `
    INSERT INTO food_products (food_id, name, category, image_url)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      category = VALUES(category),
      image_url = VALUES(image_url);
  `,
    [1, "Flavored Dip", "condiment", null]
  );

  return pool;
}
