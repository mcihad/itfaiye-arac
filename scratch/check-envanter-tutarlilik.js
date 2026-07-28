const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.substring(1, val.length - 1);
    env[key] = val;
  }
});

const pool = new Pool({ connectionString: env.DATABASE_URL });

(async () => {
  try {
    // 1. Tüm araçlarda JSON önbelleği vs vehicle_inventory karşılaştırması
    const vehs = await pool.query(`SELECT plaka, bolmeler FROM vehicles WHERE plaka IS NOT NULL ORDER BY plaka`);
    const invCounts = await pool.query(`SELECT plaka, COUNT(*) AS c FROM vehicle_inventory GROUP BY plaka`);
    const invMap = {};
    invCounts.rows.forEach(r => { invMap[r.plaka] = parseInt(r.c, 10); });

    const rapor = [];
    for (const v of vehs.rows) {
      const b = typeof v.bolmeler === 'string' ? JSON.parse(v.bolmeler || '{}') : (v.bolmeler || {});
      const jsonAdet = Object.values(b).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
      const tabloAdet = invMap[v.plaka] || 0;
      if (jsonAdet !== tabloAdet) {
        rapor.push({ plaka: v.plaka, json: jsonAdet, tablo: tabloAdet, fark: jsonAdet - tabloAdet });
      }
    }
    console.log('=== JSON önbelleği ile vehicle_inventory uyuşmayan araçlar ===');
    console.table(rapor.sort((a, b) => Math.abs(b.fark) - Math.abs(a.fark)));
    console.log(`Uyuşmayan: ${rapor.length} / ${vehs.rows.length} araç`);

    // 2. vehicle_inventory zaman damgaları var mı? 58 ACU 765 satırları ne zaman yazılmış?
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicle_inventory' ORDER BY ordinal_position`
    );
    console.log('\nvehicle_inventory kolonları:', cols.rows.map(r => r.column_name).join(', '));

    const hasCreated = cols.rows.some(r => r.column_name === 'created_at');
    if (hasCreated) {
      const ts = await pool.query(
        `SELECT MIN(created_at) AS ilk, MAX(created_at) AS son FROM vehicle_inventory WHERE plaka = $1`,
        ['58 ACU 765']
      );
      console.log('58 ACU 765 satır zaman aralığı:', ts.rows[0]);
    }

    // 3. 58 ACU 765: JSON'da olup tabloda olmayan malzemeler (bölme bazında)
    const veh = await pool.query(`SELECT bolmeler FROM vehicles WHERE plaka = $1`, ['58 ACU 765']);
    const b = veh.rows[0].bolmeler;
    const obj = typeof b === 'string' ? JSON.parse(b || '{}') : (b || {});
    const tabloRows = await pool.query(
      `SELECT vi.bolme_kapak, i.malzeme_adi FROM vehicle_inventory vi JOIN inventory i ON i.id = vi.inventory_id WHERE vi.plaka = $1`,
      ['58 ACU 765']
    );
    const tabloSet = new Set(tabloRows.rows.map(r => `${r.malzeme_adi}`.toUpperCase()));
    console.log('\n=== 58 ACU 765: JSON önbelleğinde olup tabloda OLMAYAN malzemeler ===');
    for (const [bolme, items] of Object.entries(obj)) {
      if (!Array.isArray(items)) continue;
      const eksik = items.filter(it => !tabloSet.has(String(it.malzeme || '').toUpperCase()));
      if (eksik.length > 0) {
        console.log(`\n[${bolme}] (${eksik.length} eksik):`);
        eksik.forEach(it => console.log(`  - ${it.malzeme} (adet: ${it.adet}, durum: ${it.durum || '-'})`));
      }
    }
  } catch (e) {
    console.error('HATA:', e.message);
  } finally {
    await pool.end();
  }
})();
