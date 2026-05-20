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

const parseWKBPoint = (wkbHex) => {
  if (!wkbHex || typeof wkbHex !== 'string') return null
  const cleanHex = wkbHex.trim()
  if (cleanHex.length < 42) return null
  
  const isLittleEndian = cleanHex.substring(0, 2) === '01'
  const type = cleanHex.substring(2, 10)
  
  let coordsHex = ''
  if (type === '01000020' || type === '20000001') {
    coordsHex = cleanHex.substring(18)
  } else if (type === '01000000' || type === '00000001') {
    coordsHex = cleanHex.substring(10)
  } else {
    if (cleanHex.length === 50) {
      coordsHex = cleanHex.substring(18)
    } else if (cleanHex.length === 42) {
      coordsHex = cleanHex.substring(10)
    } else {
      return null
    }
  }

  if (coordsHex.length < 32) return null

  const xHex = coordsHex.substring(0, 16)
  const yHex = coordsHex.substring(16, 32)

  const hexToDouble = (hexStr) => {
    const bytes = new Uint8Array(8)
    for (let i = 0; i < 8; i++) {
      const byteHex = hexStr.substring(i * 2, i * 2 + 2)
      bytes[isLittleEndian ? i : 7 - i] = parseInt(byteHex, 16)
    }
    const view = new DataView(bytes.buffer)
    return view.getFloat64(0, true)
  }

  return [hexToDouble(xHex), hexToDouble(yHex)]
}

async function main() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const res = await pool.query('SELECT id, no, location FROM fire_hydrants');
    console.log(`Fetched ${res.rows.length} hydrants from database.`);
    let successCount = 0;
    res.rows.forEach(row => {
      const coords = parseWKBPoint(row.location);
      if (coords) {
        successCount++;
        if (successCount <= 5 || successCount >= 55) {
          console.log(`${row.no}:`, coords);
        }
      } else {
        console.log(`Failed to parse: ${row.no}`, row.location);
      }
    });
    console.log(`Successfully parsed ${successCount} out of ${res.rows.length}`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
