const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Manually parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

async function main() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL
  });

  try {
    console.log('Adding new columns to fire_hydrants table if they do not exist...');
    
    const queries = [
      `ALTER TABLE public.fire_hydrants ADD COLUMN IF NOT EXISTS kalite TEXT;`,
      `ALTER TABLE public.fire_hydrants ADD COLUMN IF NOT EXISTS imalatci TEXT;`,
      `ALTER TABLE public.fire_hydrants ADD COLUMN IF NOT EXISTS proje_adi TEXT;`,
      `ALTER TABLE public.fire_hydrants ADD COLUMN IF NOT EXISTS musluk_ozellik TEXT;`,
      `ALTER TABLE public.fire_hydrants ADD COLUMN IF NOT EXISTS firma TEXT;`,
      `ALTER TABLE public.fire_hydrants ADD COLUMN IF NOT EXISTS yapilan_tarih TEXT;`,
      `ALTER TABLE public.fire_hydrants ADD COLUMN IF NOT EXISTS veri_kaynak TEXT;`
    ];

    for (const q of queries) {
      await pool.query(q);
    }
    
    console.log('Columns successfully checked/added.');

    // Fetch columns to verify
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fire_hydrants';
    `);
    console.log('Current Columns:');
    console.log(res.rows.map(r => `${r.column_name} (${r.data_type})`));
  } catch (err) {
    console.error('Error during ALTER TABLE:', err);
  } finally {
    await pool.end();
  }
}

main();
