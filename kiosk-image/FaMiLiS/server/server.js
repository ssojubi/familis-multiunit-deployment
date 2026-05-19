import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { initDb } from "./init.js";
import multer from "multer";
import { mkdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

let poolPromise = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "uploads");
const foodUploadsDir = path.join(uploadsRoot, "foods");
const frameLogsRoot = path.join(uploadsRoot, "frame_logs");
await mkdir(foodUploadsDir, { recursive: true });
await mkdir(frameLogsRoot, { recursive: true });

const EMOTION_SERVICE_URL = (process.env.EMOTION_SERVICE_URL || "http://127.0.0.1:8765").replace(/\/$/, "");

async function clearEmotionHistory(sessionId) {
  try {
    await fetch(`${EMOTION_SERVICE_URL}/session/${encodeURIComponent(String(sessionId))}/history`, {
      method: "DELETE",
    });
  } catch {
    /* Python emotion service is optional at runtime */
  }
}

const foodStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, foodUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
    cb(null, `food-${req.params.foodId}-${Date.now()}${safeExt}`);
  },
});

const uploadFoodImage = multer({
  storage: foodStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      cb(new Error("Only image uploads are supported."));
      return;
    }
    cb(null, true);
  },
});

const frameUploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, req._frameDir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `frame_${Date.now()}.jpg`);
  },
});

const uploadSessionFrame = multer({
  storage: frameUploadStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image uploads are supported."));
    }
  },
}).single("frame");

app.use("/uploads", express.static(uploadsRoot));

async function start() {
  if (!poolPromise) {
    poolPromise = initDb();
  }
  const pool = await poolPromise;

  function toIsoOrNull(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const allowedSessionStatuses = new Set(["pending", "active", "completed", "cancelled"]);

  async function prepareSessionFrameUpload(req, res, next) {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }
    req._frameSessionId = sessionId;
    req._frameDir = path.join(frameLogsRoot, String(sessionId));
    try {
      await mkdir(req._frameDir, { recursive: true });
      return next();
    } catch (err) {
      console.error("prepareSessionFrameUpload:", err);
      return res.status(500).json({ ok: false, error: "Could not prepare upload directory." });
    }
  }

  // Simple health endpoint to verify server + DB
  app.get("/api/health", async (_req, res) => {
    try {
      const [rows] = await pool.query("SELECT NOW() as now");
      res.json({ ok: true, dbTime: rows[0].now });
    } catch (err) {
      console.error("Health check failed:", err);
      res.status(500).json({ ok: false, error: "DB error" });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required." });
    }

    try {
      const [rows] = await pool.query(
        `
        SELECT user_id, username, email, password_hash, role
        FROM users
        WHERE email = ?
      `,
        [email]
      );

      if (rows.length === 0) {
        return res.status(401).json({ ok: false, error: "Invalid email or password." });
      }

      const user = rows[0];
      const stored = user.password_hash;

      const isBcrypt =
        typeof stored === "string" && /^\$2[aby]\$\d{2}\$/.test(stored);

      let passwordOk = false;
      if (isBcrypt) {
        passwordOk = await bcrypt.compare(password, stored);
      } else if (stored === password) {
        // Legacy plain-text row: migrate in place on first successful login.
        passwordOk = true;
        try {
          const newHash = await bcrypt.hash(password, 10);
          await pool.query("UPDATE users SET password_hash = ? WHERE user_id = ?", [
            newHash,
            user.user_id,
          ]);
        } catch (migrateErr) {
          console.error("Password hash migration failed:", migrateErr);
        }
      }

      if (!passwordOk) {
        return res.status(401).json({ ok: false, error: "Invalid email or password." });
      }

      return res.json({
        ok: true,
        user: {
          id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  app.get("/api/participants", async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT participant_id, tester_label, age, gender, created_at
        FROM participants
        ORDER BY created_at DESC, participant_id DESC
      `
      );
      return res.json({
        ok: true,
        participants: rows.map((r) => ({
          id: Number(r.participant_id),
          testerLabel: r.tester_label == null ? null : String(r.tester_label),
          age: r.age == null ? null : Number(r.age),
          gender: r.gender == null ? null : String(r.gender),
          createdAt: toIsoOrNull(r.created_at),
        })),
      });
    } catch (err) {
      console.error("GET /api/participants error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  app.post("/api/participants", async (req, res) => {
    const rawLabel = req.body?.testerLabel;
    const testerLabel = typeof rawLabel === "string" ? rawLabel.trim() : "";
    const ageRaw = req.body?.age;
    const genderRaw = req.body?.gender;
    if (!testerLabel) {
      return res.status(400).json({ ok: false, error: "testerLabel is required." });
    }
    const age =
      ageRaw == null || ageRaw === ""
        ? null
        : Number.isFinite(Number(ageRaw))
          ? Math.round(Number(ageRaw))
          : null;
    if (age != null && (age < 0 || age > 120)) {
      return res.status(400).json({ ok: false, error: "age must be between 0 and 120." });
    }
    const allowedGenders = new Set(["male", "female", "other"]);
    const gender = genderRaw == null || genderRaw === "" ? null : String(genderRaw);
    if (gender != null && !allowedGenders.has(gender)) {
      return res.status(400).json({ ok: false, error: "gender must be male, female, or other." });
    }

    try {
      const [[existing]] = await pool.query(
        `
        SELECT participant_id, tester_label, age, gender, created_at
        FROM participants
        WHERE tester_label = ?
        LIMIT 1
      `,
        [testerLabel]
      );

      if (existing) {
        await pool.query(
          `
          UPDATE participants
          SET age = COALESCE(?, age),
              gender = COALESCE(?, gender)
          WHERE participant_id = ?
        `,
          [age, gender, Number(existing.participant_id)]
        );
        const [[updated]] = await pool.query(
          `
          SELECT participant_id, tester_label, age, gender, created_at
          FROM participants
          WHERE participant_id = ?
          LIMIT 1
        `,
          [Number(existing.participant_id)]
        );
        return res.json({
          ok: true,
          participant: {
            id: Number(updated.participant_id),
            testerLabel: updated.tester_label == null ? null : String(updated.tester_label),
            age: updated.age == null ? null : Number(updated.age),
            gender: updated.gender == null ? null : String(updated.gender),
            createdAt: toIsoOrNull(updated.created_at),
          },
          reused: true,
        });
      }

      const [result] = await pool.query(
        `INSERT INTO participants (tester_label, age, gender) VALUES (?, ?, ?)`,
        [testerLabel, age, gender]
      );
      return res.json({
        ok: true,
        participant: {
          id: Number(result.insertId),
          testerLabel,
          age,
          gender,
          createdAt: new Date().toISOString(),
        },
        reused: false,
      });
    } catch (err) {
      console.error("POST /api/participants error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  app.delete("/api/participants/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id." });
    }
    try {
      const [result] = await pool.query(
        `DELETE FROM participants WHERE participant_id = ?`,
        [id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Participant not found." });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/participants error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  app.put("/api/participants/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id." });
    }
    const rawLabel = req.body?.testerLabel;
    const testerLabel = typeof rawLabel === "string" ? rawLabel.trim() : "";
    const ageRaw = req.body?.age;
    const genderRaw = req.body?.gender;
    if (!testerLabel) {
      return res.status(400).json({ ok: false, error: "testerLabel is required." });
    }
    const age =
      ageRaw == null || ageRaw === ""
        ? null
        : Number.isFinite(Number(ageRaw))
          ? Math.round(Number(ageRaw))
          : null;
    const allowedGenders = new Set(["male", "female", "other"]);
    const gender = genderRaw == null || genderRaw === "" ? null : String(genderRaw);
    if (gender != null && !allowedGenders.has(gender)) {
      return res.status(400).json({ ok: false, error: "gender must be male, female, or other." });
    }
    try {
      const [result] = await pool.query(
        `UPDATE participants
        SET tester_label = ?, age = ?, gender = ?
        WHERE participant_id = ?`,
        [testerLabel, age, gender, id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Participant not found." });
      }
      return res.json({ ok: true, participant: { id, testerLabel, age, gender } });
    } catch (err) {
      console.error("PUT /api/participants error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Foods list for dashboard
  app.get("/api/foods", async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT
          fp.food_id,
          fp.name,
          fp.category,
          fp.image_url,
          fp.created_at,
          COUNT(s.session_id) AS sessions_total,
          SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS sessions_active,
          AVG(
            CASE
              WHEN s.start_time IS NOT NULL AND s.end_time IS NOT NULL THEN TIMESTAMPDIFF(SECOND, s.start_time, s.end_time) / 60.0
              ELSE NULL
            END
          ) AS avg_duration_min
        FROM food_products fp
        LEFT JOIN sessions s ON s.food_id = fp.food_id
        GROUP BY fp.food_id, fp.name, fp.category, fp.image_url, fp.created_at
        ORDER BY fp.created_at DESC, fp.food_id DESC
      `
      );

      const foods = rows.map((r) => ({
        id: Number(r.food_id),
        name: r.name,
        category: r.category,
        imageUrl: r.image_url == null ? null : String(r.image_url),
        createdAt: toIsoOrNull(r.created_at),
        sessionsTotal: Number(r.sessions_total ?? 0),
        sessionsActive: Number(r.sessions_active ?? 0),
        avgDurationMin: r.avg_duration_min == null ? null : Number(r.avg_duration_min),
      }));

      return res.json({ ok: true, foods });
    } catch (err) {
      console.error("GET /api/foods error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Create food
  app.post("/api/foods", async (req, res) => {
    const { name, category } = req.body ?? {};
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedCategory = typeof category === "string" ? category.trim() : "";

    if (!trimmedName || !trimmedCategory) {
      return res.status(400).json({ ok: false, error: "name and category are required." });
    }

    try {
      const [result] = await pool.query(
        `
        INSERT INTO food_products (name, category)
        VALUES (?, ?)
      `,
        [trimmedName, trimmedCategory]
      );

      return res.json({
        ok: true,
        food: {
          id: Number(result.insertId),
          name: trimmedName,
          category: trimmedCategory,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("POST /api/foods error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  app.post("/api/foods/:foodId/image", uploadFoodImage.single("image"), async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Image file is required." });
    }

    try {
      const imageUrl = `/uploads/foods/${req.file.filename}`;
      const [result] = await pool.query(
        `
        UPDATE food_products
        SET image_url = ?
        WHERE food_id = ?
      `,
        [imageUrl, foodId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Food not found." });
      }
      return res.json({ ok: true, imageUrl });
    } catch (err) {
      console.error("POST /api/foods/:foodId/image error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Delete food (cascades sessions/frame_logs/survey_results via FKs)
  app.delete("/api/foods/:foodId", async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [sessionDelete] = await conn.query(`DELETE FROM sessions WHERE food_id = ?`, [foodId]);
      const [result] = await conn.query(`DELETE FROM food_products WHERE food_id = ?`, [foodId]);
      if (result.affectedRows === 0) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: "Food not found." });
      }

      await conn.commit();
      return res.json({
        ok: true,
        deletedSessions: Number(sessionDelete?.affectedRows ?? 0),
      });
    } catch (err) {
      if (conn) await conn.rollback();
      console.error("DELETE /api/foods/:foodId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    } finally {
      conn?.release();
    }
  });

  // Sessions for a specific food (for "View Sessions" in dashboard)
  app.get("/api/foods/:foodId/sessions", async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    try {
      const [rows] = await pool.query(
        `
        SELECT
          s.session_id,
          s.user_id,
          s.start_time,
          s.end_time,
          s.status,
          COUNT(fl.frame_log_id) AS frames,
          AVG(fl.confidence_score) AS mean_confidence
        FROM sessions s
        LEFT JOIN frame_logs fl ON fl.session_id = s.session_id
        WHERE s.food_id = ?
        GROUP BY s.session_id, s.user_id, s.start_time, s.end_time, s.status
        ORDER BY COALESCE(s.start_time, s.created_at) DESC, s.session_id DESC
      `,
        [foodId]
      );

      const sessions = rows.map((r) => ({
        id: Number(r.session_id),
        userId: Number(r.user_id),
        startTime: toIsoOrNull(r.start_time),
        endTime: toIsoOrNull(r.end_time),
        status: r.status, // 'pending' | 'active' | 'completed' | 'cancelled'
        frames: Number(r.frames ?? 0),
        meanConfidence: r.mean_confidence == null ? null : Number(r.mean_confidence),
      }));

      return res.json({ ok: true, sessions });
    } catch (err) {
      console.error("GET /api/foods/:foodId/sessions error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Analytics for a specific food
  app.get("/api/foods/:foodId/analytics", async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    try {
      const [[sessionCountRow]] = await pool.query(
        `
        SELECT COUNT(*) AS session_count
        FROM sessions
        WHERE food_id = ?
      `,
        [foodId]
      );

      const [[confidenceRow]] = await pool.query(
        `
        SELECT AVG(fl.confidence_score) AS mean_confidence
        FROM frame_logs fl
        INNER JOIN sessions s ON s.session_id = fl.session_id
        WHERE s.food_id = ? AND fl.confidence_score IS NOT NULL
      `,
        [foodId]
      );

      const [[hedonicRow]] = await pool.query(
        `
        SELECT AVG(fl.hedonic_score) AS mean_hedonic
        FROM frame_logs fl
        INNER JOIN sessions s ON s.session_id = fl.session_id
        WHERE s.food_id = ? AND fl.hedonic_score IS NOT NULL
      `,
        [foodId]
      );

      const [[distRow]] = await pool.query(
        `
        SELECT
          SUM(CASE WHEN (fl.hedonic_score * 8 + 1) >= 7 THEN 1 ELSE 0 END) AS positive_count,
          SUM(CASE WHEN (fl.hedonic_score * 8 + 1) >= 5 AND (fl.hedonic_score * 8 + 1) < 7 THEN 1 ELSE 0 END) AS neutral_count,
          SUM(CASE WHEN (fl.hedonic_score * 8 + 1) < 5 THEN 1 ELSE 0 END) AS negative_count,
          COUNT(fl.frame_log_id) AS total_count
        FROM frame_logs fl
        INNER JOIN sessions s ON s.session_id = fl.session_id
        WHERE s.food_id = ? AND fl.hedonic_score IS NOT NULL
      `,
        [foodId]
      );

      const totalCount = Number(distRow?.total_count ?? 0);
      const pct = (n) => (totalCount === 0 ? 0 : Math.round((Number(n ?? 0) / totalCount) * 100));
      const distribution = [
        { label: "Positive (7-9)", value: pct(distRow?.positive_count), color: "#22c55e" },
        { label: "Neutral (5-6)", value: pct(distRow?.neutral_count), color: "#eab308" },
        { label: "Negative (1-4)", value: pct(distRow?.negative_count), color: "#ef4444" },
      ];
      // Fix rounding drift to keep a stable 100% in the UI.
      const drift = 100 - distribution.reduce((a, b) => a + b.value, 0);
      if (drift !== 0) distribution[0].value = Math.max(0, distribution[0].value + drift);

      const [[radarRow]] = await pool.query(
        `
        SELECT
          AVG(sr.color_rating) AS color_rating,
          AVG(sr.flavor_aroma_rating) AS flavor_aroma_rating,
          AVG(sr.salt_sweet_rating) AS salt_sweet_rating,
          AVG(sr.texture_rating) AS texture_rating,
          AVG(sr.final_overall_rating) AS final_overall_rating
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        WHERE s.food_id = ?
      `,
        [foodId]
      );

      const to9FromNormalized = (n) => (n == null ? null : Number(n) * 8 + 1);
      const radar = [
        { label: "Color", score: radarRow?.color_rating == null ? 0 : Number(radarRow.color_rating) },
        {
          label: "Flavor/Aroma",
          score: radarRow?.flavor_aroma_rating == null ? 0 : Number(radarRow.flavor_aroma_rating),
        },
        { label: "Salt/Sweet", score: radarRow?.salt_sweet_rating == null ? 0 : Number(radarRow.salt_sweet_rating) },
        { label: "Texture", score: radarRow?.texture_rating == null ? 0 : Number(radarRow.texture_rating) },
        {
          label: "Overall",
          score: radarRow?.final_overall_rating == null ? 0 : Number(radarRow.final_overall_rating),
        },
      ];

      let timeline = [
        { label: "First taste", score: 0, sub: "Early" },
        { label: "Mid", score: 0, sub: "Middle" },
        { label: "Aftertaste", score: 0, sub: "Late" },
      ];
      try {
        const [timelineRows] = await pool.query(
          `
          WITH fl AS (
            SELECT fl.hedonic_score, fl.timestamp
            FROM frame_logs fl
            INNER JOIN sessions s ON s.session_id = fl.session_id
            WHERE s.food_id = ? AND fl.hedonic_score IS NOT NULL
          ),
          bucketed AS (
            SELECT hedonic_score, NTILE(3) OVER (ORDER BY timestamp) AS bucket
            FROM fl
          )
          SELECT bucket, AVG(hedonic_score) AS avg_score
          FROM bucketed
          GROUP BY bucket
          ORDER BY bucket
        `,
          [foodId]
        );

        const byBucket = new Map(timelineRows.map((r) => [Number(r.bucket), Number(r.avg_score)]));
        timeline = [
          { label: "First taste", score: to9FromNormalized(byBucket.get(1)) ?? 0, sub: "Early" },
          { label: "Mid", score: to9FromNormalized(byBucket.get(2)) ?? 0, sub: "Middle" },
          { label: "Aftertaste", score: to9FromNormalized(byBucket.get(3)) ?? 0, sub: "Late" },
        ];
      } catch (err) {
        // If NTILE/WITH isn't supported, keep timeline as zeros.
        console.warn("Timeline query not supported, using zeros:", err?.message ?? err);
      }

      const [ageRows] = await pool.query(
        `
        SELECT
          CASE
            WHEN p.age BETWEEN 18 AND 25 THEN '18–25'
            WHEN p.age BETWEEN 26 AND 40 THEN '26–40'
            WHEN p.age BETWEEN 41 AND 60 THEN '41–60'
            WHEN p.age >= 61 THEN '61+'
            ELSE 'Unknown'
          END AS age_group,
          AVG(sr.final_overall_rating) AS avg_rating
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        LEFT JOIN participants p ON p.participant_id = s.participant_id
        WHERE s.food_id = ?
        GROUP BY age_group
      `,
        [foodId]
      );

      const [genderRows] = await pool.query(
        `
        SELECT
          COALESCE(p.gender, 'other') AS gender,
          AVG(sr.final_overall_rating) AS avg_rating
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        LEFT JOIN participants p ON p.participant_id = s.participant_id
        WHERE s.food_id = ?
        GROUP BY gender
      `,
        [foodId]
      );

      const byAge = ageRows
        .filter((r) => r.age_group !== "Unknown")
        .map((r) => ({ label: r.age_group, score: r.avg_rating == null ? 0 : Number(r.avg_rating) }));

      const byGender = genderRows.map((r) => ({
        label: String(r.gender).charAt(0).toUpperCase() + String(r.gender).slice(1),
        score: r.avg_rating == null ? 0 : Number(r.avg_rating),
      }));

      const [[surveyCountRow]] = await pool.query(
        `
        SELECT COUNT(*) AS survey_count
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        WHERE s.food_id = ?
      `,
        [foodId]
      );
      const sessionCount = Number(sessionCountRow?.session_count ?? 0);
      const surveyCount = Number(surveyCountRow?.survey_count ?? 0);

      return res.json({
        ok: true,
        analytics: {
          meanConfidence: confidenceRow?.mean_confidence == null ? 0 : Number(confidenceRow.mean_confidence),
          // hedonic_score is normalized 0..1 in frame_logs; map to 1..9 for UI consistency.
          meanHedonic: hedonicRow?.mean_hedonic == null ? 0 : Number(hedonicRow.mean_hedonic) * 8 + 1,
          distribution,
          radar,
          timeline,
          byAge,
          byGender,
          sampleSize: surveyCount,
          sessionCount,
          frameLogCount: totalCount,
          surveyCount,
        },
      });
    } catch (err) {
      console.error("GET /api/foods/:foodId/analytics error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Start a new session for a given food/user (used by Camera Setup)
  app.post("/api/sessions/start", async (req, res) => {
    const { userId, foodId, participantId } = req.body ?? {};
    const uId = Number.parseInt(String(userId ?? ""), 10);
    const fId = Number.parseInt(String(foodId ?? ""), 10);
    const pId =
      participantId == null || participantId === ""
        ? null
        : Number.parseInt(String(participantId), 10);

    if (!Number.isFinite(uId) || !Number.isFinite(fId) || (pId != null && !Number.isFinite(pId))) {
      return res.status(400).json({ ok: false, error: "userId, foodId, and optional participantId are required." });
    }

    try {
      const [result] = await pool.query(
        `
        INSERT INTO sessions (user_id, participant_id, food_id, start_time, status)
        VALUES (?, ?, ?, NOW(), 'active')
      `,
        [uId, pId, fId]
      );

      return res.json({
        ok: true,
        session: {
          id: Number(result.insertId),
          userId: uId,
          participantId: pId,
          foodId: fId,
          status: "active",
          startTime: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("POST /api/sessions/start error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Get a session + its food (used by Camera Session UI)
  app.get("/api/sessions/:sessionId", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    try {
      const [rows] = await pool.query(
        `
        SELECT
          s.session_id,
          s.user_id,
          s.participant_id,
          s.food_id,
          s.status,
          s.start_time,
          s.end_time,
          fp.name AS food_name,
          fp.category AS food_category,
          fp.image_url AS food_image_url
        FROM sessions s
        LEFT JOIN food_products fp ON fp.food_id = s.food_id
        WHERE s.session_id = ?
        LIMIT 1
      `,
        [sessionId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      const r = rows[0];

      return res.json({
        ok: true,
        session: {
          id: Number(r.session_id),
          userId: Number(r.user_id),
          participantId: r.participant_id == null ? null : Number(r.participant_id),
          foodId: Number(r.food_id),
          status: r.status,
          startTime: toIsoOrNull(r.start_time),
          endTime: toIsoOrNull(r.end_time),
        },
        food: r.food_name
          ? {
              id: Number(r.food_id),
              name: String(r.food_name),
              category: String(r.food_category ?? ""),
              imageUrl: r.food_image_url == null ? null : String(r.food_image_url),
            }
          : null,
      });
    } catch (err) {
      console.error("GET /api/sessions/:sessionId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Proxy: Python emotion service health (optional; used by Session UI)
  app.get("/api/emotion/health", async (_req, res) => {
    try {
      const r = await fetch(`${EMOTION_SERVICE_URL}/health`);
      const j = await r.json().catch(() => null);
      return res.json({ ok: true, emotion: j });
    } catch (err) {
      console.warn("GET /api/emotion/health: emotion service unreachable:", err?.message || err);
      return res.json({
        ok: false,
        emotion: null,
        error: "Emotion service unreachable. Start backend/6.3/emotion_service.py or set EMOTION_SERVICE_URL.",
      });
    }
  });

  // Upload one camera frame: save image, run 6.3 inference, insert frame_logs
  app.post(
    "/api/sessions/:sessionId/frames",
    prepareSessionFrameUpload,
    (req, res, next) => {
      uploadSessionFrame(req, res, (err) => {
        if (err) {
          return res.status(400).json({ ok: false, error: err.message || "Upload failed." });
        }
        next();
      });
    },
    async (req, res) => {
      const sessionId = req._frameSessionId;
      if (!req.file?.path) {
        return res.status(400).json({ ok: false, error: "Missing frame (multipart field name: frame)." });
      }

      try {
        const [[sess]] = await pool.query(`SELECT status FROM sessions WHERE session_id = ? LIMIT 1`, [sessionId]);
        if (!sess) {
          return res.status(404).json({ ok: false, error: "Session not found." });
        }
        if (sess.status !== "active") {
          return res.status(409).json({ ok: false, error: "Session is not active; cannot record frames." });
        }

        let faceDetected = null;
        let hedonic = null;
        let conf = null;
        let inferenceOk = false;
        let inferenceError = null;
        let sentiment = null;
        let valence1to9 = null;

        try {
          const buf = await readFile(req.file.path);
          const fd = new FormData();
          fd.append("session_id", String(sessionId));
          fd.append(
            "image",
            new Blob([buf], { type: req.file.mimetype || "image/jpeg" }),
            req.file.filename || "frame.jpg"
          );
          const predRes = await fetch(`${EMOTION_SERVICE_URL}/predict`, { method: "POST", body: fd });
          const predJson = await predRes.json().catch(() => null);
          if (predRes.ok && predJson && predJson.ok === true) {
            inferenceOk = true;
            sentiment = predJson.sentiment == null ? null : String(predJson.sentiment);
            valence1to9 = typeof predJson.valence1to9 === "number" ? predJson.valence1to9 : null;
            if (predJson.faceDetected === true) {
              faceDetected = true;
              hedonic = typeof predJson.hedonicScore === "number" ? predJson.hedonicScore : null;
              conf = typeof predJson.confidenceScore === "number" ? predJson.confidenceScore : null;
            } else if (predJson.faceDetected === false) {
              faceDetected = false;
            }
          } else {
            inferenceError =
              (predJson && predJson.error) || `Emotion service HTTP ${predRes.status}`;
          }
        } catch (err) {
          inferenceError = err?.message || String(err);
          console.warn("Frame inference error:", inferenceError);
        }

        const relUrl = `/uploads/frame_logs/${sessionId}/${req.file.filename}`;
        const [insertResult] = await pool.query(
          `
          INSERT INTO frame_logs (session_id, timestamp, face_detected, confidence_score, hedonic_score, frame_image_url)
          VALUES (?, NOW(), ?, ?, ?, ?)
        `,
          [sessionId, faceDetected, conf, hedonic, relUrl]
        );

        return res.json({
          ok: true,
          frameLogId: Number(insertResult.insertId),
          frameImageUrl: relUrl,
          faceDetected,
          confidenceScore: conf,
          hedonicScore: hedonic,
          sentiment,
          valence1to9,
          inferenceOk,
          inferenceError,
        });
      } catch (err) {
        console.error("POST /api/sessions/:sessionId/frames error:", err);
        return res.status(500).json({ ok: false, error: "Server error." });
      }
    }
  );

  // Full session detail for the results page (frame logs, system logs, survey results)
  app.get("/api/sessions/:sessionId/details", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    try {
      const [[sessionRow]] = await pool.query(
        `
        SELECT
          s.session_id,
          s.user_id,
          s.participant_id,
          s.food_id,
          s.status,
          s.start_time,
          s.end_time,
          fp.name AS food_name,
          fp.category AS food_category,
          fp.image_url AS food_image_url
        FROM sessions s
        LEFT JOIN food_products fp ON fp.food_id = s.food_id
        WHERE s.session_id = ?
        LIMIT 1
        `,
        [sessionId]
      );

      if (!sessionRow) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      const [[frameStatsRow]] = await pool.query(
        `
        SELECT
          COUNT(*) AS total_frames,
          AVG(confidence_score) AS mean_confidence,
          AVG(hedonic_score) AS mean_hedonic
        FROM frame_logs
        WHERE session_id = ?
        `,
        [sessionId]
      );

      const [frameRows] = await pool.query(
        `
        SELECT
          timestamp,
          face_detected,
          confidence_score,
          hedonic_score,
          frame_image_url
        FROM frame_logs
        WHERE session_id = ?
        ORDER BY timestamp ASC
        `,
        [sessionId]
      );

      const [systemRows] = await pool.query(
        `
        SELECT
          log_type,
          message,
          created_at
        FROM system_logs
        WHERE session_id = ?
        ORDER BY created_at ASC
        `,
        [sessionId]
      );

      const [[surveyRow]] = await pool.query(
        `
        SELECT
          p.age AS participant_age,
          p.gender AS participant_gender,
          color_rating,
          flavor_aroma_rating,
          salt_sweet_rating,
          texture_rating,
          final_overall_rating,
          remarks
        FROM sessions s
        LEFT JOIN survey_results sr ON sr.session_id = s.session_id
        LEFT JOIN participants p ON p.participant_id = s.participant_id
        WHERE s.session_id = ?
        LIMIT 1
        `,
        [sessionId]
      );

      return res.json({
        ok: true,
        session: {
          id: Number(sessionRow.session_id),
          userId: Number(sessionRow.user_id),
          participantId: sessionRow.participant_id == null ? null : Number(sessionRow.participant_id),
          foodId: Number(sessionRow.food_id),
          status: sessionRow.status,
          startTime: toIsoOrNull(sessionRow.start_time),
          endTime: toIsoOrNull(sessionRow.end_time),
        },
        food: sessionRow.food_name
          ? {
              id: Number(sessionRow.food_id),
              name: String(sessionRow.food_name),
              category: String(sessionRow.food_category ?? ""),
              imageUrl: sessionRow.food_image_url == null ? null : String(sessionRow.food_image_url),
            }
          : null,
        metrics: {
          totalFrames: Number(frameStatsRow?.total_frames ?? 0),
          meanConfidence:
            frameStatsRow?.mean_confidence == null ? null : Number(frameStatsRow.mean_confidence),
          // hedonic_score is stored 0..1 in frame_logs; convert to 0..1, then the frontend scales to /10.
          meanHedonic: frameStatsRow?.mean_hedonic == null ? null : Number(frameStatsRow.mean_hedonic),
        },
        frameLogs: (frameRows ?? []).map((r) => ({
          timestamp: toIsoOrNull(r.timestamp),
          faceDetected: r.face_detected == null ? null : Boolean(r.face_detected),
          confidenceScore: r.confidence_score == null ? null : Number(r.confidence_score),
          hedonicScore: r.hedonic_score == null ? null : Number(r.hedonic_score),
          frameImageUrl: r.frame_image_url == null ? null : String(r.frame_image_url),
        })),
        systemLogs: (systemRows ?? []).map((r) => ({
          logType: r.log_type,
          message: String(r.message ?? ""),
          createdAt: toIsoOrNull(r.created_at),
        })),
        surveyResults: surveyRow
          ? {
              age: surveyRow.participant_age == null ? null : Number(surveyRow.participant_age),
              gender: surveyRow.participant_gender == null ? null : String(surveyRow.participant_gender),
              colorRating: surveyRow.color_rating == null ? null : Number(surveyRow.color_rating),
              flavorAromaRating:
                surveyRow.flavor_aroma_rating == null ? null : Number(surveyRow.flavor_aroma_rating),
              saltSweetRating:
                surveyRow.salt_sweet_rating == null ? null : Number(surveyRow.salt_sweet_rating),
              textureRating:
                surveyRow.texture_rating == null ? null : Number(surveyRow.texture_rating),
              finalOverallRating:
                surveyRow.final_overall_rating == null ? null : Number(surveyRow.final_overall_rating),
              remarks: surveyRow.remarks == null ? null : String(surveyRow.remarks),
            }
          : null,
      });
    } catch (err) {
      console.error("GET /api/sessions/:sessionId/details error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Stop an active session (used by Stop Recording -> Survey)
  app.post("/api/sessions/:sessionId/stop", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    try {
      const [result] = await pool.query(
        `
        UPDATE sessions
        SET end_time = NOW(),
            status = 'completed'
        WHERE session_id = ?
      `,
        [sessionId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      // Fetch the updated row to return to the client
      const [[row]] = await pool.query(
        `
        SELECT
          session_id,
          user_id,
          participant_id,
          food_id,
          status,
          start_time,
          end_time
        FROM sessions
        WHERE session_id = ?
        LIMIT 1
      `,
        [sessionId]
      );

      void clearEmotionHistory(sessionId);

      return res.json({
        ok: true,
        session: {
          id: Number(row.session_id),
          userId: Number(row.user_id),
          participantId: row.participant_id == null ? null : Number(row.participant_id),
          foodId: Number(row.food_id),
          status: row.status,
          startTime: toIsoOrNull(row.start_time),
          endTime: toIsoOrNull(row.end_time),
        },
      });
    } catch (err) {
      console.error("POST /api/sessions/:sessionId/stop error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Update session status from session detail header control
  app.patch("/api/sessions/:sessionId/status", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }
    const statusRaw = req.body?.status;
    const status = typeof statusRaw === "string" ? statusRaw.trim().toLowerCase() : "";
    if (!allowedSessionStatuses.has(status)) {
      return res.status(400).json({
        ok: false,
        error: "status must be one of pending, active, completed, cancelled.",
      });
    }

    try {
      const [result] = await pool.query(
        `
        UPDATE sessions
        SET status = ?,
            end_time = CASE
              WHEN ? = 'completed' AND end_time IS NULL THEN NOW()
              ELSE end_time
            END
        WHERE session_id = ?
      `,
        [status, status, sessionId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      const [[row]] = await pool.query(
        `
        SELECT session_id, user_id, participant_id, food_id, status, start_time, end_time
        FROM sessions
        WHERE session_id = ?
        LIMIT 1
      `,
        [sessionId]
      );
      return res.json({
        ok: true,
        session: {
          id: Number(row.session_id),
          userId: Number(row.user_id),
          participantId: row.participant_id == null ? null : Number(row.participant_id),
          foodId: Number(row.food_id),
          status: row.status,
          startTime: toIsoOrNull(row.start_time),
          endTime: toIsoOrNull(row.end_time),
        },
      });
    } catch (err) {
      console.error("PATCH /api/sessions/:sessionId/status error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  app.delete("/api/sessions/:sessionId", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }
    try {
      const [result] = await pool.query(`DELETE FROM sessions WHERE session_id = ?`, [sessionId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/sessions/:sessionId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Submit survey results for a session (one row per session via UNIQUE(session_id))
  app.post("/api/sessions/:sessionId/survey", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    const {
      colorRating,
      flavorAromaRating,
      saltSweetRating,
      textureRating,
      finalOverallRating,
      remarks,
    } = req.body ?? {};

    const toIntOrNull = (v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.round(n);
    };

    const toTrimmedOrNull = (v) => {
      if (typeof v !== "string") return null;
      const t = v.trim();
      return t.length ? t : null;
    };

    const colorInt = toIntOrNull(colorRating);
    const flavorInt = toIntOrNull(flavorAromaRating);
    const saltInt = toIntOrNull(saltSweetRating);
    const textureInt = toIntOrNull(textureRating);
    const finalInt = toIntOrNull(finalOverallRating);

    // Require all five ratings from the UI (matches the form design).
    if (
      colorInt == null ||
      flavorInt == null ||
      saltInt == null ||
      textureInt == null ||
      finalInt == null
    ) {
      return res.status(400).json({
        ok: false,
        error: "All ratings (Color, Flavor/Aroma, Salt/Sweet, Texture, Overall) are required.",
      });
    }

    // Basic range check (DB also enforces 1..9).
    for (const [k, n] of [
      ["colorRating", colorInt],
      ["flavorAromaRating", flavorInt],
      ["saltSweetRating", saltInt],
      ["textureRating", textureInt],
      ["finalOverallRating", finalInt],
    ]) {
      if (n < 1 || n > 9) {
        return res.status(400).json({ ok: false, error: `${k} must be between 1 and 9.` });
      }
    }

    const remarksVal = toTrimmedOrNull(remarks);

    try {
      const [[sessionRow]] = await pool.query(
        `SELECT session_id FROM sessions WHERE session_id = ? LIMIT 1`,
        [sessionId]
      );

      if (!sessionRow) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      // Ensure the session is marked completed even if stop endpoint wasn't called.
      await pool.query(
        `
        UPDATE sessions
        SET status = 'completed',
            end_time = COALESCE(end_time, NOW())
        WHERE session_id = ?
      `,
        [sessionId]
      );

      await pool.query(
        `
        INSERT INTO survey_results (
          session_id,
          color_rating, flavor_aroma_rating, salt_sweet_rating,
          texture_rating, final_overall_rating,
          remarks
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          color_rating = VALUES(color_rating),
          flavor_aroma_rating = VALUES(flavor_aroma_rating),
          salt_sweet_rating = VALUES(salt_sweet_rating),
          texture_rating = VALUES(texture_rating),
          final_overall_rating = VALUES(final_overall_rating),
          remarks = VALUES(remarks)
      `,
        [
          sessionId,
          colorInt,
          flavorInt,
          saltInt,
          textureInt,
          finalInt,
          remarksVal,
        ]
      );

      return res.json({ ok: true, sessionId });
    } catch (err) {
      console.error("POST /api/sessions/:sessionId/survey error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

