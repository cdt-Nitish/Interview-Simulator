const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'interview_simulator',
  port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
};

let pool = null;
let isConnected = false;

// Create connection pool
function getPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }
  return pool;
}

// Table schemas for automated initialization
const TABLE_DEFINITIONS = [
  `CREATE TABLE IF NOT EXISTS \`users\` (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`first_name\` VARCHAR(100) NOT NULL,
    \`last_name\` VARCHAR(100) DEFAULT '',
    \`email\` VARCHAR(191) NOT NULL UNIQUE,
    \`password\` VARCHAR(255) NOT NULL,
    \`role\` ENUM('candidate', 'interviewer', 'admin') DEFAULT 'candidate',
    \`target_role\` VARCHAR(100) DEFAULT 'Full Stack',
    \`experience_level\` VARCHAR(100) DEFAULT 'Fresher / Entry',
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_users_email\` (\`email\`),
    INDEX \`idx_users_role\` (\`role\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`interviews\` (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`user_id\` INT NOT NULL,
    \`role\` VARCHAR(100) NOT NULL,
    \`interview_type\` VARCHAR(50) DEFAULT 'Technical',
    \`difficulty\` VARCHAR(50) DEFAULT 'Medium',
    \`score\` DECIMAL(4, 2) DEFAULT NULL,
    \`status\` ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
    \`feedback\` TEXT,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
    INDEX \`idx_interviews_user\` (\`user_id\`),
    INDEX \`idx_interviews_status\` (\`status\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`questions\` (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`interview_id\` INT NOT NULL,
    \`question_text\` TEXT NOT NULL,
    \`question_order\` INT DEFAULT 1,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (\`interview_id\`) REFERENCES \`interviews\` (\`id\`) ON DELETE CASCADE,
    INDEX \`idx_questions_interview\` (\`interview_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`answers\` (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`question_id\` INT NOT NULL,
    \`user_id\` INT NOT NULL,
    \`answer_text\` TEXT,
    \`score\` DECIMAL(4, 2) DEFAULT NULL,
    \`feedback\` TEXT,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (\`question_id\`) REFERENCES \`questions\` (\`id\`) ON DELETE CASCADE,
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
    INDEX \`idx_answers_question\` (\`question_id\`),
    INDEX \`idx_answers_user\` (\`user_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`interview_metrics\` (
    \`id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`interview_id\` INT NOT NULL,
    \`face_detection_pct\` DECIMAL(5, 2) DEFAULT 0.00,
    \`eye_contact_pct\` DECIMAL(5, 2) DEFAULT 0.00,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (\`interview_id\`) REFERENCES \`interviews\` (\`id\`) ON DELETE CASCADE,
    INDEX \`idx_metrics_interview\` (\`interview_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`sessions\` (
    \`session_id\` VARCHAR(128) COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
    \`expires\` INT UNSIGNED NOT NULL,
    \`data\` MEDIUMTEXT COLLATE utf8mb4_unicode_ci,
    INDEX \`idx_sessions_expires\` (\`expires\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
];

async function connectDB() {
  try {
    // 1. First ensure the target database exists on MySQL server
    const serverConnection = await mysql.createConnection({
      host: DB_CONFIG.host,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
      port: DB_CONFIG.port,
    });

    await serverConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await serverConnection.end();

    // 2. Initialize the connection pool to the database
    const dbPool = getPool();
    const testConnection = await dbPool.getConnection();
    isConnected = true;
    testConnection.release();

    console.log(`[MySQL] Connected successfully to: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);

    // 3. Initialize all core tables
    for (const sql of TABLE_DEFINITIONS) {
      await dbPool.query(sql);
    }
    console.log('[MySQL] Core schema tables validated & initialized.');

    return dbPool;
  } catch (err) {
    isConnected = false;
    console.warn(`[MySQL] Notice: Could not connect to MySQL at ${DB_CONFIG.host}:${DB_CONFIG.port}`);
    console.warn(`[MySQL] Detail: ${err.message}`);
    console.log('[MySQL] Please ensure MySQL service is running and credentials in .env are correct.');
    return null;
  }
}

async function query(sql, params) {
  const dbPool = getPool();
  return dbPool.query(sql, params);
}

module.exports = {
  pool: getPool(),
  getPool,
  connectDB,
  query,
  isDbConnected: () => isConnected,
  DB_CONFIG,
};
