const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Adding beer_fact column...');

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS beer_fact TEXT;
    `);

    console.log('Added beer_fact column successfully!');

  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
