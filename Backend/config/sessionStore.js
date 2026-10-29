const session = require('express-session');

/**
 * MySQLSessionStore
 * Lightweight, robust persistent session store for express-session backed by MySQL2.
 */
class MySQLSessionStore extends session.Store {
  constructor(pool, options = {}) {
    super();
    this.pool = pool;
    this.tableName = options.tableName || 'sessions';

    // Periodically clean up expired sessions (every 15 minutes)
    this.cleanupInterval = setInterval(() => {
      this.clearExpired().catch(() => {});
    }, 15 * 60 * 1000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  async get(sid, callback) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const [rows] = await this.pool.query(
        `SELECT data FROM \`${this.tableName}\` WHERE session_id = ? AND expires > ? LIMIT 1`,
        [sid, now]
      );

      if (!rows || rows.length === 0) {
        return callback(null, null);
      }

      const sessionData = JSON.parse(rows[0].data);
      return callback(null, sessionData);
    } catch (err) {
      return callback(err);
    }
  }

  async set(sid, sessionData, callback) {
    try {
      let expires;
      if (sessionData && sessionData.cookie && sessionData.cookie.expires) {
        expires = Math.floor(new Date(sessionData.cookie.expires).getTime() / 1000);
      } else {
        const maxAge = sessionData?.cookie?.maxAge || 1000 * 60 * 60 * 24 * 7;
        expires = Math.floor((Date.now() + maxAge) / 1000);
      }

      const serialized = JSON.stringify(sessionData);
      await this.pool.query(
        `REPLACE INTO \`${this.tableName}\` (session_id, expires, data) VALUES (?, ?, ?)`,
        [sid, expires, serialized]
      );

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await this.pool.query(
        `DELETE FROM \`${this.tableName}\` WHERE session_id = ?`,
        [sid]
      );
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async touch(sid, sessionData, callback) {
    try {
      let expires;
      if (sessionData && sessionData.cookie && sessionData.cookie.expires) {
        expires = Math.floor(new Date(sessionData.cookie.expires).getTime() / 1000);
      } else {
        const maxAge = sessionData?.cookie?.maxAge || 1000 * 60 * 60 * 24 * 7;
        expires = Math.floor((Date.now() + maxAge) / 1000);
      }

      await this.pool.query(
        `UPDATE \`${this.tableName}\` SET expires = ? WHERE session_id = ?`,
        [expires, sid]
      );

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async clearExpired() {
    try {
      const now = Math.floor(Date.now() / 1000);
      await this.pool.query(
        `DELETE FROM \`${this.tableName}\` WHERE expires <= ?`,
        [now]
      );
    } catch (err) {
      // Ignored during passive background cleanup
    }
  }
}

module.exports = MySQLSessionStore;
