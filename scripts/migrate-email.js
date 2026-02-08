const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Running migration...');

    // Add email and display_name columns if they don't exist
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
    `);
    console.log('Added email and display_name columns');

    // Copy username to email and display_name for existing users
    await client.query(`
      UPDATE users SET email = username WHERE email IS NULL;
      UPDATE users SET display_name = username WHERE display_name IS NULL;
    `);
    console.log('Migrated existing usernames to email/display_name');

    // Create password_resets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created password_resets table');

    console.log('\nMigration completed successfully!');

  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
