const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const users = [
  'austen',
  'jake',
  'dorian',
  'cheng',
  'bridget',
  'julia',
  'bianca',
  'nathan',
  'anna'
];

async function createInvites() {
  const baseUrl = 'https://beer-tracker-campbellericksons-projects.vercel.app';

  console.log('\n🍺 INVITE LINKS FOR YOUR FRIENDS 🍺\n');
  console.log('='.repeat(60));

  for (const user of users) {
    const code = uuidv4().slice(0, 8).toUpperCase();

    try {
      await pool.query(
        'INSERT INTO invites (code, created_by) VALUES ($1, $2)',
        [code, null]
      );

      console.log(`\n${user.toUpperCase()}:`);
      console.log(`${baseUrl}?invite=${code}&ref=admin`);
    } catch (err) {
      console.error(`Failed to create invite for ${user}:`, err.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\nDone! Share these links with your friends.\n');

  pool.end();
}

createInvites();
