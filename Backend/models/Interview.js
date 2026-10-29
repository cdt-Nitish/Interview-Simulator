const { pool } = require('../config/db');

class Interview {
  constructor(data = {}) {
    this.id = data.id || null;
    this.userId = data.userId || data.user_id || null;
    this.role = data.role || 'Full Stack Developer';
    this.interviewType = data.interviewType || data.interview_type || 'Technical';
    this.difficulty = data.difficulty || 'Medium';
    this.score = data.score !== undefined ? data.score : null;
    this.status = data.status || 'pending';
    this.feedback = data.feedback || '';
    this.createdAt = data.createdAt || data.created_at || null;
    this.updatedAt = data.updatedAt || data.updated_at || null;
  }

  async save() {
    if (!this.id) {
      const [result] = await pool.query(
        `INSERT INTO interviews (user_id, role, interview_type, difficulty, score, status, feedback)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          this.userId,
          this.role,
          this.interviewType,
          this.difficulty,
          this.score,
          this.status,
          this.feedback,
        ]
      );
      this.id = result.insertId;
      return this;
    } else {
      await pool.query(
        `UPDATE interviews
         SET role = ?, interview_type = ?, difficulty = ?, score = ?, status = ?, feedback = ?
         WHERE id = ?`,
        [
          this.role,
          this.interviewType,
          this.difficulty,
          this.score,
          this.status,
          this.feedback,
          this.id,
        ]
      );
      return this;
    }
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM interviews WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return null;
    return new Interview(rows[0]);
  }

  static async findByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM interviews WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map((r) => new Interview(r));
  }
}

module.exports = Interview;
