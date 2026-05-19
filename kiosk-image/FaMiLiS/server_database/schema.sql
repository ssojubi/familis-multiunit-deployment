-- =====================================================
-- MySQL schema for Familis Project (Revised v2)
-- =====================================================

CREATE DATABASE IF NOT EXISTS familis_db;
USE familis_db;

-- USERS (staff/admin operators)
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role ENUM('staff', 'admin') NOT NULL DEFAULT 'staff',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL
);

-- PARTICIPANTS (test subjects)
CREATE TABLE IF NOT EXISTS participants (
  participant_id INT AUTO_INCREMENT PRIMARY KEY,
  tester_label VARCHAR(50), -- e.g. "T-01"
  age INT,
  gender ENUM('male', 'female', 'other'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_participant_age CHECK (age >= 0 AND age <= 120)
);

-- FOOD PRODUCTS
CREATE TABLE IF NOT EXISTS food_products (
  food_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  image_url TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_food_category (category)
);

-- SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
  session_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  participant_id INT NULL,
  food_id INT NOT NULL,
  start_time TIMESTAMP NULL,
  end_time TIMESTAMP NULL,
  status ENUM('pending', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_session_user (user_id),
  INDEX idx_session_food (food_id),
  INDEX idx_session_participant (participant_id),

  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_participant FOREIGN KEY (participant_id) REFERENCES participants(participant_id) ON DELETE SET NULL,
  CONSTRAINT fk_sessions_food FOREIGN KEY (food_id) REFERENCES food_products(food_id),
  CONSTRAINT chk_end_after_start CHECK (end_time IS NULL OR end_time >= start_time)
);

-- FRAME LOGS
CREATE TABLE IF NOT EXISTS frame_logs (
  frame_log_id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,  
  timestamp TIMESTAMP NOT NULL,
  face_detected BOOLEAN,
  confidence_score FLOAT,
  hedonic_score FLOAT,
  frame_image_url TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_frame_session (session_id),
  INDEX idx_frame_time (timestamp),

  CONSTRAINT fk_frame_session FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT chk_confidence CHECK (confidence_score BETWEEN 0 AND 1),
  CONSTRAINT chk_hedonic CHECK (hedonic_score BETWEEN 0 AND 1)
);

-- SYSTEM LOGS
CREATE TABLE IF NOT EXISTS system_logs (
  system_log_id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NULL,
  log_type ENUM('error', 'warning', 'info') NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_logs_session (session_id),

  CONSTRAINT fk_logs_session FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

-- SURVEY RESULTS
CREATE TABLE IF NOT EXISTS survey_results (
  survey_result_id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,

  color_rating INT,
  flavor_aroma_rating INT,
  salt_sweet_rating INT,
  texture_rating INT,
  final_overall_rating INT,

  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_survey_session (session_id),
  INDEX idx_survey_session (session_id),

  CONSTRAINT fk_survey_session FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT chk_color CHECK (color_rating BETWEEN 1 AND 9),
  CONSTRAINT chk_flavor CHECK (flavor_aroma_rating BETWEEN 1 AND 9),
  CONSTRAINT chk_salt CHECK (salt_sweet_rating BETWEEN 1 AND 9),
  CONSTRAINT chk_texture CHECK (texture_rating BETWEEN 1 AND 9),
  CONSTRAINT chk_final CHECK (final_overall_rating BETWEEN 1 AND 9)
);

-- =====================================================
-- RELATIONSHIPS
-- =====================================================
-- users (staff/admin) 1 ──▶ M sessions
-- participants         1 ──▶ M sessions
-- food_products        1 ──▶ M sessions
-- sessions             1 ──▶ M frame_logs
-- sessions             1 ──▶ M system_logs
-- sessions             1 ──▶ 1 survey_results

