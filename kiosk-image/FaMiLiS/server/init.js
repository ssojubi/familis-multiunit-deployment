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

async function addIndexIfMissing(pool, tableName, indexName, columns) {
  const [[row]] = await pool.query(
    `
    SELECT COUNT(*) AS index_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND index_name = ?
    `,
    [tableName, indexName],
  );

  if (Number(row?.index_count ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columns})`,
    );
  }
}

async function addForeignKeyIfMissing(
  pool,
  tableName,
  constraintName,
  definition,
) {
  const [[row]] = await pool.query(
    `
    SELECT COUNT(*) AS constraint_count
    FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = ?
      AND constraint_name = ?
      AND constraint_type = 'FOREIGN KEY'
    `,
    [tableName, constraintName],
  );

  if (Number(row?.constraint_count ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` ${definition}`,
    );
  }
}

function createPool() {
  if (!process.env.DATABASE_URL) {
    return mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "familis_central",
      waitForConnections: true,
      connectionLimit: 10,
      multipleStatements: true,
    });
  }

  const url = new URL(process.env.DATABASE_URL);
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

  await addColumnIfMissing(pool, "sessions", "testing_room_id", "INT NULL");
  await addIndexIfMissing(
    pool,
    "sessions",
    "idx_session_testing_room",
    "`testing_room_id`",
  );
  await addForeignKeyIfMissing(
    pool,
    "sessions",
    "fk_sessions_testing_room",
    "FOREIGN KEY (`testing_room_id`) REFERENCES `testing_rooms` (`testing_room_id`) ON DELETE SET NULL",
  );

  await pool.query(`
    ALTER TABLE users
    MODIFY role ENUM('staff', 'tester', 'admin') NOT NULL DEFAULT 'tester'
  `);
  await pool.query("UPDATE users SET role = 'tester' WHERE role = 'staff'");
  await pool.query(`
    ALTER TABLE users
    MODIFY role ENUM('tester', 'admin') NOT NULL DEFAULT 'tester'
  `);

  const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const [[admin]] = await pool.query(
    "SELECT user_id, password_hash FROM users WHERE email = ? LIMIT 1",
    ["admin@familis.com"],
  );
  if (!admin) {
    if (!initialAdminPassword || initialAdminPassword.length < 12) {
      throw new Error(
        "INITIAL_ADMIN_PASSWORD must contain at least 12 characters on a fresh installation.",
      );
    }
    const adminPasswordHash = await bcrypt.hash(initialAdminPassword, 10);
    await pool.query(
      `
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, 'admin')
      `,
      ["admin", "admin@familis.com", adminPasswordHash],
    );
  } else if (
    initialAdminPassword &&
    initialAdminPassword !== "admin123" &&
    (await bcrypt.compare("admin123", admin.password_hash))
  ) {
    const replacementHash = await bcrypt.hash(initialAdminPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = ?, role = 'admin' WHERE user_id = ?",
      [replacementHash, admin.user_id],
    );
    console.log("Replaced the legacy default administrator password.");
  }

  const initialTesterPassword = process.env.INITIAL_TESTER_PASSWORD;
  if (initialTesterPassword && initialTesterPassword.length >= 12) {
    const testerPasswordHash = await bcrypt.hash(initialTesterPassword, 10);
    for (let number = 1; number <= 10; number += 1) {
      const suffix = String(number).padStart(2, "0");
      const username = `Tester ${suffix}`;
      const email = `tester${suffix}@familis.com`;
      const [[tester]] = await pool.query(
        "SELECT user_id, password_hash FROM users WHERE email = ? LIMIT 1",
        [email],
      );
      if (!tester) {
        await pool.query(
          "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'tester')",
          [username, email, testerPasswordHash],
        );
      } else if (await bcrypt.compare("Tester123!", tester.password_hash)) {
        await pool.query(
          "UPDATE users SET password_hash = ?, role = 'tester' WHERE user_id = ?",
          [testerPasswordHash, tester.user_id],
        );
      }
      await pool.query(
        `INSERT INTO participants (name, email, tester_label)
         SELECT ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM participants WHERE LOWER(email) = LOWER(?)
         )`,
        [username, email, `T-${suffix}`, email],
      );
    }
  }

  await pool.query(
    `
    INSERT INTO food_products (food_id, name, category, image_url)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE food_id = food_id;
  `,
    [1, "Flavored Dip", "condiment", null]
  );

  return pool;
}
