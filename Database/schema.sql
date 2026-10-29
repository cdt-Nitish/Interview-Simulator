-- =====================================================================
-- InterviewAI Platform - Relational Database Schema (MySQL 8.0+)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `interview_simulator` 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `interview_simulator`;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) DEFAULT '',
    `email` VARCHAR(191) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('candidate', 'interviewer', 'admin') DEFAULT 'candidate',
    `target_role` VARCHAR(100) DEFAULT 'Full Stack',
    `experience_level` VARCHAR(100) DEFAULT 'Fresher / Entry',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_users_email` (`email`),
    INDEX `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. INTERVIEWS TABLE
CREATE TABLE IF NOT EXISTS `interviews` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `role` VARCHAR(100) NOT NULL,
    `interview_type` VARCHAR(50) DEFAULT 'Technical',
    `difficulty` VARCHAR(50) DEFAULT 'Medium',
    `score` DECIMAL(4, 2) DEFAULT NULL,
    `status` ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
    `feedback` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    INDEX `idx_interviews_user` (`user_id`),
    INDEX `idx_interviews_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS `questions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `interview_id` INT NOT NULL,
    `question_text` TEXT NOT NULL,
    `question_order` INT DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`interview_id`) REFERENCES `interviews` (`id`) ON DELETE CASCADE,
    INDEX `idx_questions_interview` (`interview_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. ANSWERS TABLE
CREATE TABLE IF NOT EXISTS `answers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `question_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    `answer_text` TEXT,
    `score` DECIMAL(4, 2) DEFAULT NULL,
    `feedback` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`question_id`) REFERENCES `questions` (`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    INDEX `idx_answers_question` (`question_id`),
    INDEX `idx_answers_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. INTERVIEW METRICS TABLE (MediaPipe Face & Eye Gaze Analytics)
CREATE TABLE IF NOT EXISTS `interview_metrics` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `interview_id` INT NOT NULL,
    `face_detection_pct` DECIMAL(5, 2) DEFAULT 0.00,
    `eye_contact_pct` DECIMAL(5, 2) DEFAULT 0.00,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`interview_id`) REFERENCES `interviews` (`id`) ON DELETE CASCADE,
    INDEX `idx_metrics_interview` (`interview_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. SESSIONS TABLE (Persistent MySQL Session Store)
CREATE TABLE IF NOT EXISTS `sessions` (
    `session_id` VARCHAR(128) COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
    `expires` INT UNSIGNED NOT NULL,
    `data` MEDIUMTEXT COLLATE utf8mb4_unicode_ci,
    INDEX `idx_sessions_expires` (`expires`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
