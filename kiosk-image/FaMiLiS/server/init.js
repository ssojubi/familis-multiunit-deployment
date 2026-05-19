import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createPool() {
  // Example: mysql://user:password@localhost:3306/familis_db
  const connectionString =
    process.env.DATABASE_URL || "mysql://root:@localhost:3306/familis_db";

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

  // Run schema.sql (now MySQL dialect) to ensure tables/enums exist
  const schemaPath = path.resolve(__dirname, "../server_database/schema.sql");
  const schemaSql = await readFile(schemaPath, "utf8");
  await pool.query(schemaSql);

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

  /**
   * ------------------------------------------------------------
   * SAMPLE DATA (copy/paste when you want to seed)
   * ------------------------------------------------------------
   * These are intentionally comments so they do NOT auto-insert.
   *
   * They are designed to match `server_database/schema.sql`:
   * - `food_products`
   * - `sessions`
   * - `frame_logs`
   * - `survey_results`
   * - `system_logs`
   *
   * Notes:
   * - Replace hard-coded IDs if your DB already has rows.
   * - `hedonic_score` / `confidence_score` are 0..1.
   * - Survey ratings are 1..9 (converted to /10 in dashboard).
   * - Live FER during Session: run `python backend/6.3/emotion_service.py` (after `pip install -r
   *   backend/6.3/requirements.txt` and training `*.pkl` models). Optional env on the Node server:
   *   `EMOTION_SERVICE_URL` (default http://127.0.0.1:8765). Frames are stored under `server/uploads/frame_logs/`.
   */
  /*
  -- Food products
  INSERT INTO food_products (food_id, name, category) VALUES
    (1, 'Ice Cream', 'dessert'),
    (2, 'Potato Chips', 'snack'),
    (3, 'Orange Juice', 'beverage')
  ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category);

  -- Sessions (one active, two completed, one cancelled)
  INSERT INTO sessions (session_id, user_id, food_id, start_time, end_time, status) VALUES
    (101, 1, 1, '2026-03-10 10:30:00', '2026-03-10 10:45:00', 'completed'),
    (102, 1, 1, '2026-03-11 14:15:00', '2026-03-11 14:30:00', 'completed'),
    (103, 1, 1, '2026-03-12 11:00:00', NULL, 'active'),
    (201, 1, 2, '2026-03-13 09:05:00', '2026-03-13 09:18:00', 'cancelled')
  ON DUPLICATE KEY UPDATE
    user_id = VALUES(user_id),
    food_id = VALUES(food_id),
    start_time = VALUES(start_time),
    end_time = VALUES(end_time),
    status = VALUES(status);

  -- Frame logs (sampled at a few timestamps per session)
  INSERT INTO frame_logs (session_id, timestamp, face_detected, confidence_score, hedonic_score) VALUES
    (101, '2026-03-10 10:30:10', true, 0.82, 0.62),
    (101, '2026-03-10 10:32:30', true, 0.86, 0.71),
    (101, '2026-03-10 10:44:20', true, 0.79, 0.68),
    (102, '2026-03-11 14:15:20', true, 0.91, 0.73),
    (102, '2026-03-11 14:22:05', true, 0.93, 0.78),
    (102, '2026-03-11 14:29:10', true, 0.88, 0.74),
    (103, '2026-03-12 11:00:05', true, 0.77, 0.55),
    (103, '2026-03-12 11:02:10', true, 0.81, 0.60);

  -- Survey results (one per session)
  INSERT INTO survey_results (
    session_id, age, gender,
    color_rating, flavor_aroma_rating, salt_sweet_rating, texture_rating, final_overall_rating,
    remarks
  ) VALUES
    (101, 23, 'female', 7, 8, 7, 6, 8, 'Liked the strawberry flavor.'),
    (102, 34, 'male',   6, 7, 6, 7, 7, 'Good overall, slightly too sweet.'),
    (201, 45, 'other',  5, 5, 4, 5, 4, 'Not enjoyable.');

  -- System logs (optional)
  INSERT INTO system_logs (session_id, log_type, message) VALUES
    (103, 'info', 'Session started'),
    (103, 'warning', 'Lighting low, confidence may drop');
  */

  return pool;
}

