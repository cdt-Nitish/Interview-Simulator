const { pool } = require('../config/db');

class User {
  constructor(data = {}) {
    this.id = data.id || data._id || null;
    this.firstName = data.firstName || data.first_name || '';
    this.lastName = data.lastName || data.last_name || '';
    this.email = data.email ? data.email.trim().toLowerCase() : '';
    this.password = data.password || '';
    this.role = data.role || 'candidate';
    this.targetRole = data.targetRole || data.target_role || 'Full Stack';
    this.experienceLevel = data.experienceLevel || data.experience_level || 'Fresher / Entry';
    this.createdAt = data.createdAt || data.created_at || null;
    this.updatedAt = data.updatedAt || data.updated_at || null;
  }

  // Backward compatibility alias for _id
  get _id() {
    return this.id;
  }

  set _id(val) {
    this.id = val;
  }

  // Formatted full name helper
  get fullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  /**
   * Save user to MySQL (INSERT if new, UPDATE if existing)
   */
  async save() {
    if (!this.id) {
      const [result] = await pool.query(
        `INSERT INTO users (first_name, last_name, email, password, role, target_role, experience_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          this.firstName,
          this.lastName,
          this.email,
          this.password,
          this.role,
          this.targetRole,
          this.experienceLevel,
        ]
      );
      this.id = result.insertId;
      return this;
    } else {
      await pool.query(
        `UPDATE users 
         SET first_name = ?, last_name = ?, email = ?, password = ?, role = ?, target_role = ?, experience_level = ?
         WHERE id = ?`,
        [
          this.firstName,
          this.lastName,
          this.email,
          this.password,
          this.role,
          this.targetRole,
          this.experienceLevel,
          this.id,
        ]
      );
      return this;
    }
  }

  /**
   * Find a single user by criteria (e.g. { email: '...' } or { id: 1 })
   */
  static async findOne(criteria = {}) {
    if (criteria.email) {
      return this.findByEmail(criteria.email);
    }
    if (criteria.id || criteria._id) {
      return this.findById(criteria.id || criteria._id);
    }

    const keys = Object.keys(criteria);
    if (keys.length === 0) return null;

    // Convert camelCase to snake_case column names
    const colMap = {
      firstName: 'first_name',
      lastName: 'last_name',
      targetRole: 'target_role',
      experienceLevel: 'experience_level',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    };

    const clauses = keys.map((k) => `\`${colMap[k] || k}\` = ?`).join(' AND ');
    const values = keys.map((k) => criteria[k]);

    const [rows] = await pool.query(`SELECT * FROM users WHERE ${clauses} LIMIT 1`, values);
    if (!rows || rows.length === 0) return null;
    return new User(rows[0]);
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1', [normalized]);
    if (!rows || rows.length === 0) return null;
    return new User(rows[0]);
  }

  /**
   * Find user by primary key ID
   */
  static async findById(id) {
    if (!id) return null;
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return null;
    return new User(rows[0]);
  }

  /**
   * Create and immediately save a new user
   */
  static async create(userData) {
    const user = new User(userData);
    await user.save();
    return user;
  }

  /**
   * Find all users matching optional conditions
   */
  static async find(criteria = {}) {
    const keys = Object.keys(criteria);
    if (keys.length === 0) {
      const [rows] = await pool.query('SELECT * FROM users ORDER BY id DESC');
      return rows.map((r) => new User(r));
    }

    const colMap = {
      firstName: 'first_name',
      lastName: 'last_name',
      targetRole: 'target_role',
      experienceLevel: 'experience_level',
    };

    const clauses = keys.map((k) => `\`${colMap[k] || k}\` = ?`).join(' AND ');
    const values = keys.map((k) => criteria[k]);

    const [rows] = await pool.query(`SELECT * FROM users WHERE ${clauses} ORDER BY id DESC`, values);
    return rows.map((r) => new User(r));
  }

  /**
   * Delete user by ID
   */
  static async deleteById(id) {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  toJSON() {
    return {
      id: this.id,
      _id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      email: this.email,
      role: this.role,
      targetRole: this.targetRole,
      experienceLevel: this.experienceLevel,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = User;
