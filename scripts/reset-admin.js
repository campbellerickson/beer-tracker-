const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function resetAdmin() {
  const client = await pool.connect();

  try {
    console.log('Resetting admin...');

    // Delete existing admin users and their data (handle foreign keys)
    await client.query(`
      DELETE FROM drinks WHERE user_id IN (SELECT id FROM users WHERE is_admin = TRUE);
      DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE is_admin = TRUE);
      UPDATE invites SET created_by = NULL WHERE created_by IN (SELECT id FROM users WHERE is_admin = TRUE);
      UPDATE invites SET used_by = NULL WHERE used_by IN (SELECT id FROM users WHERE is_admin = TRUE);
      DELETE FROM users WHERE is_admin = TRUE;
    `);
    console.log('Deleted existing admin users');

    // Delete old admin invites and create new one
    await client.query("DELETE FROM invites WHERE is_admin = TRUE");

    const newCode = 'ADMIN' + Math.random().toString(36).substring(2, 6).toUpperCase();
    await client.query(
      "INSERT INTO invites (code, is_admin) VALUES ($1, TRUE)",
      [newCode]
    );

    console.log('\n========================================');
    console.log('NEW ADMIN INVITE CODE: ' + newCode);
    console.log('========================================\n');

  } catch (err) {
    console.error('Error resetting admin:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

resetAdmin();
