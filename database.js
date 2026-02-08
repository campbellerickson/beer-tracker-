const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = {
  // Users
  async getUser(id) {
    const result = await pool.query(
      'SELECT id, username, password, beer_count, is_admin, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  async getUserByUsername(username) {
    const result = await pool.query(
      'SELECT id, username, password, beer_count, is_admin, created_at FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  },

  async createUser(id, username, password, isAdmin = false) {
    const result = await pool.query(
      'INSERT INTO users (id, username, password, is_admin) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, username, password, isAdmin]
    );
    return result.rows[0];
  },

  async recordDrink(userId, username, beerType) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET beer_count = beer_count + 1 WHERE id = $1',
        [userId]
      );
      await client.query(
        'INSERT INTO drinks (user_id, username, beer_type) VALUES ($1, $2, $3)',
        [userId, username, beerType]
      );
      const result = await client.query(
        'SELECT beer_count FROM users WHERE id = $1',
        [userId]
      );
      await client.query('COMMIT');
      return result.rows[0]?.beer_count || 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getLeaderboard() {
    const result = await pool.query(
      'SELECT username, beer_count, is_admin FROM users ORDER BY beer_count DESC'
    );
    return result.rows;
  },

  async getTotalBeers() {
    const result = await pool.query('SELECT COALESCE(SUM(beer_count), 0) as total FROM users');
    return parseInt(result.rows[0].total, 10);
  },

  async getRecentDrinks(limit = 10) {
    const result = await pool.query(
      'SELECT username, beer_type, created_at as timestamp FROM drinks ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  },

  // Invites
  async getInvite(code) {
    const result = await pool.query('SELECT * FROM invites WHERE code = $1', [code]);
    return result.rows[0] || null;
  },

  async isInviteValid(code) {
    const result = await pool.query(
      'SELECT code FROM invites WHERE code = $1 AND used_by IS NULL',
      [code]
    );
    return result.rows.length > 0;
  },

  async useInvite(code, userId) {
    const result = await pool.query(
      'UPDATE invites SET used_by = $1, used_at = CURRENT_TIMESTAMP WHERE code = $2 RETURNING is_admin',
      [userId, code]
    );
    return result.rows[0]?.is_admin || false;
  },

  async createInvite(code, createdBy) {
    await pool.query(
      'INSERT INTO invites (code, created_by) VALUES ($1, $2)',
      [code, createdBy]
    );
  },

  // Sessions
  async getSession(token) {
    const result = await pool.query(
      'SELECT * FROM sessions WHERE token = $1',
      [token]
    );
    return result.rows[0] || null;
  },

  async createSession(token, userId) {
    await pool.query(
      'INSERT INTO sessions (token, user_id) VALUES ($1, $2)',
      [token, userId]
    );
  },

  async deleteSession(token) {
    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  }
};
