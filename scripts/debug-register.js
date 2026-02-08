const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function test() {
  try {
    // Check if invite is valid
    const invite = await pool.query('SELECT * FROM invites WHERE code = $1', ['ADMINV4RL']);
    console.log('Invite:', invite.rows[0]);

    // Check if email already exists
    const existing = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', ['campbellerickson1@gmail.com']);
    console.log('Existing user:', existing.rows[0] || 'None');

    // Try a direct insert
    if (!existing.rows[0] && invite.rows[0] && !invite.rows[0].used_by) {
      const userId = uuidv4();
      console.log('Attempting to create user with ID:', userId);

      const result = await pool.query(
        'INSERT INTO users (id, email, display_name, password, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [userId, 'campbellerickson1@gmail.com', 'Campbell1', 'testpass', true]
      );
      console.log('Created user:', result.rows[0]);

      // Mark invite as used
      await pool.query('UPDATE invites SET used_by = $1, used_at = NOW() WHERE code = $2', [userId, 'ADMINV4RL']);
      console.log('Invite marked as used');
    } else if (existing.rows[0]) {
      console.log('User already exists!');
    } else if (invite.rows[0]?.used_by) {
      console.log('Invite already used!');
    }
  } catch (e) {
    console.log('Error:', e.message);
    console.log(e);
  }

  pool.end();
}

test();
