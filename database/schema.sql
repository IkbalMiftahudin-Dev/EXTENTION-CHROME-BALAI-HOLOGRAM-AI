-- ============================================================
-- BALAI Holographic AI Assistant - MySQL Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS `hologram_ai`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `hologram_ai`;

-- 1. Tabel Jadwal / Schedule
CREATE TABLE IF NOT EXISTS `schedules` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `event_date` DATE NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NULL,
  `location` VARCHAR(150) NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'general',
  `status` ENUM('upcoming', 'done', 'cancelled') NOT NULL DEFAULT 'upcoming',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_event_date` (`event_date`, `start_time`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Tugas / Tasks
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `notes` TEXT NULL,
  `due_date` DATE NULL,
  `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  `is_completed` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_completed_due` (`is_completed`, `due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabel Riwayat Percakapan
CREATE TABLE IF NOT EXISTS `chat_history` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` VARCHAR(64) NOT NULL DEFAULT 'default',
  `role` ENUM('user', 'assistant') NOT NULL,
  `content` TEXT NOT NULL,
  `emotion` VARCHAR(32) NOT NULL DEFAULT 'neutral',
  `tool_used` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_session_created` (`session_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabel Pengaturan Sistem
CREATE TABLE IF NOT EXISTS `settings` (
  `setting_key` VARCHAR(64) NOT NULL,
  `setting_value` TEXT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Settings
INSERT IGNORE INTO `settings` (`setting_key`, `setting_value`) VALUES
  ('assistant_name', 'BALAI'),
  ('gemini_api_key', ''),
  ('gemini_model', 'gemini-3-flash-preview'),
  ('hologram_theme', 'cyan'),
  ('voice_rate', '1.05'),
  ('voice_pitch', '1.0');

-- Sample Schedules (relative to today so immediate testing works!)
INSERT INTO `schedules` (`title`, `description`, `event_date`, `start_time`, `end_time`, `location`, `category`, `status`)
SELECT * FROM (
  SELECT 'Standup Meeting Tim AI' AS title, 'Review progres integrasi avatar 3D dan modul suara.' AS description, CURDATE() AS event_date, '09:30:00' AS start_time, '10:00:00' AS end_time, 'Google Meet' AS location, 'work' AS category, 'done' AS status
  UNION ALL
  SELECT 'Presentasi Demo Hologram AI', 'Demo prototipe asisten AI holografik ke klien.', CURDATE(), '14:00:00', '15:30:00', 'Ruang Meeting Lt. 3', 'work', 'upcoming'
  UNION ALL
  SELECT 'Olahraga Sore / Gym', 'Latihan kardio dan peregangan rutin.', CURDATE(), '17:30:00', '18:30:00', 'Fitness Center', 'personal', 'upcoming'
  UNION ALL
  SELECT 'Diskusi Arsitektur Database', 'Optimasi query jadwal dan sinkronisasi kalender.', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00', '11:30:00', 'Kantor Utama', 'work', 'upcoming'
  UNION ALL
  SELECT 'Makan Malam Bersama Keluarga', 'Reservasi meja atas nama Ikbal.', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '19:00:00', '21:00:00', 'Restoran Nusantara', 'personal', 'upcoming'
) AS seed_schedules
WHERE NOT EXISTS (SELECT 1 FROM `schedules` LIMIT 1);

-- Sample Tasks
INSERT INTO `tasks` (`title`, `notes`, `due_date`, `priority`, `is_completed`)
SELECT * FROM (
  SELECT 'Tambahkan Gemini API Key di Pengaturan' AS title, 'Dapatkan gratis dari Google AI Studio (aistudio.google.com).' AS notes, CURDATE() AS due_date, 'high' AS priority, 0 AS is_completed
  UNION ALL
  SELECT 'Siapkan model avatar .VRM kustom (opsional)', 'Bisa buat di VRoid Studio lalu unggah langsung ke tampilan hologram.', DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'medium', 0
  UNION ALL
  SELECT 'Kirim laporan mingguan proyek', 'Rekap hasil pengembangan sistem asisten suara.', CURDATE(), 'high', 0
) AS seed_tasks
WHERE NOT EXISTS (SELECT 1 FROM `tasks` LIMIT 1);
