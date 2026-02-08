const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = {
  // Users
  async getUser(id) {
    const result = await pool.query(
      'SELECT id, email, display_name, password, beer_count, is_admin, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  async getUserByEmail(email) {
    const result = await pool.query(
      'SELECT id, email, display_name, password, beer_count, is_admin, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return result.rows[0] || null;
  },

  // Legacy support - also check email field
  async getUserByUsername(username) {
    const result = await pool.query(
      'SELECT id, email, display_name, password, beer_count, is_admin, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [username]
    );
    return result.rows[0] || null;
  },

  async createUser(id, email, displayName, password, isAdmin = false) {
    const result = await pool.query(
      'INSERT INTO users (id, email, display_name, password, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, email, displayName, password, isAdmin]
    );
    return result.rows[0];
  },

  // Password Reset
  async createPasswordReset(email, code) {
    // Delete any existing reset codes for this email
    await pool.query('DELETE FROM password_resets WHERE LOWER(email) = LOWER($1)', [email]);
    // Create new reset code (expires in 1 hour)
    await pool.query(
      'INSERT INTO password_resets (email, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\')',
      [email, code]
    );
  },

  async getPasswordReset(code) {
    const result = await pool.query(
      'SELECT * FROM password_resets WHERE code = $1 AND expires_at > NOW()',
      [code]
    );
    return result.rows[0] || null;
  },

  async deletePasswordReset(code) {
    await pool.query('DELETE FROM password_resets WHERE code = $1', [code]);
  },

  async updatePassword(email, newPassword) {
    await pool.query(
      'UPDATE users SET password = $1 WHERE LOWER(email) = LOWER($2)',
      [newPassword, email]
    );
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
  },

  // Profile functions
  async getPublicProfile(displayName) {
    const result = await pool.query(
      'SELECT display_name, beer_count, beer_fact, profile_photo, is_admin, created_at FROM users WHERE LOWER(display_name) = LOWER($1)',
      [displayName]
    );
    return result.rows[0] || null;
  },

  async updateProfile(userId, updates) {
    const { beerFact, profilePhoto } = updates;
    await pool.query(
      'UPDATE users SET beer_fact = COALESCE($1, beer_fact), profile_photo = COALESCE($2, profile_photo) WHERE id = $3',
      [beerFact, profilePhoto, userId]
    );
  },

  async getAllProfiles() {
    const result = await pool.query(
      'SELECT display_name, beer_count, beer_fact, profile_photo, is_admin FROM users ORDER BY beer_count DESC'
    );
    return result.rows;
  },

  // Chat functions
  async sendMessage(userId, displayName, content) {
    const result = await pool.query(
      'INSERT INTO messages (user_id, display_name, content) VALUES ($1, $2, $3) RETURNING *',
      [userId, displayName, content]
    );
    return result.rows[0];
  },

  async getMessages(limit = 50, before = null) {
    let query = 'SELECT m.*, u.profile_photo FROM messages m LEFT JOIN users u ON m.user_id = u.id ORDER BY m.created_at DESC LIMIT $1';
    let params = [limit];

    if (before) {
      query = 'SELECT m.*, u.profile_photo FROM messages m LEFT JOIN users u ON m.user_id = u.id WHERE m.id < $2 ORDER BY m.created_at DESC LIMIT $1';
      params = [limit, before];
    }

    const result = await pool.query(query, params);
    return result.rows.reverse(); // Return in chronological order
  },

  // Admin functions
  async resetAllProgress() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET beer_count = 0');
      await client.query('DELETE FROM drinks');
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};
