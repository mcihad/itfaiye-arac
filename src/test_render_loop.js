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

const parseLocation = (loc) => {
  if (!loc) return null
  if (typeof loc === 'string') {
    const trimmed = loc.trim()
    if (/^[0-9a-fA-F]+$/.test(trimmed)) {
      const parsed = parseWKBPoint(trimmed)
      if (parsed) return parsed
    }
    try {
      const parsed = JSON.parse(loc)
      if (parsed.coordinates) {
        return [parsed.coordinates[0], parsed.coordinates[1]]
      }
    } catch {
      return null
    }
  }
  if (loc.coordinates) {
    return [loc.coordinates[0], loc.coordinates[1]]
  }
  return null
}

async function main() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const res = await pool.query('SELECT * FROM fire_hydrants');
    console.log(`Analyzing ${res.rows.length} rows...`);
    
    let parsedCount = 0;
    let errCount = 0;
    
    res.rows.forEach((hyd, idx) => {
      try {
        const coords = parseLocation(hyd.location);
        if (!coords) {
          console.log(`Index ${idx} (${hyd.no}): parsed coordinates is null`);
          return;
        }
        
        // Simulate SVG compilation
        const isMevcut = hyd.durum === 'MEVCUT';
        const gradientId = `hydrant-grad-${hyd.id}`;
        
        // This is exactly the SVG string from Map.tsx
        const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width: 100%; height: 100%; filter: ${isMevcut ? 'drop-shadow(0 0 8px #22c55e)' : 'drop-shadow(0 0 10px #ef4444)'};">
            <circle cx="50" cy="50" r="42" fill="url(#${gradientId})" stroke="#ffffff" stroke-width="3"/>
            <path d="M35 42 L35 70 C35 76 65 76 65 70 L65 42 Z" fill="#ffffff" opacity="0.95"/>
            <path d="M30 32 H70 V42 H30 Z" fill="#ffffff"/>
            <circle cx="50" cy="22" r="8" fill="#ffffff"/>
            <path d="M50 48 C53 52 53 58 50 62 C47 58 47 52 50 48 Z" fill="${isMevcut ? '#15803d' : '#b91c1c'}"/>
            <defs>
              <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${isMevcut ? '#22c55e' : '#ef4444'}" />
                <stop offset="100%" stop-color="${isMevcut ? '#15803d' : '#b91c1c'}" />
              </linearGradient>
            </defs>
          </svg>
        `;
        
        parsedCount++;
      } catch (err) {
        console.error(`Error rendering index ${idx} (${hyd.no}):`, err);
        errCount++;
      }
    });
    
    console.log(`Rendering simulation finished: ${parsedCount} success, ${errCount} errors.`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
