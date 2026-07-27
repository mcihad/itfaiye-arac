const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
});

async function main() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const res = await pool.query('SELECT no, location, length(location::text) as len FROM fire_hydrants');
    const lengths = {};
    res.rows.forEach(row => {
      const len = row.location ? row.location.length : 0;
      lengths[len] = (lengths[len] || 0) + 1;
      if (len !== 50) {
        console.log(`Unexpected length for ${row.no}: ${len} (type of location: ${typeof row.location})`);
      }
    });
    console.log("Length distribution:", lengths);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
