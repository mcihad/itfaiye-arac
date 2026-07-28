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
const PLAKA = '58 ACU 765';

(async () => {
  try {
    // 1. vehicle_inventory: bölme bazında satır sayıları
    const inv = await pool.query(
      `SELECT bolme_kapak, COUNT(*) AS adet FROM vehicle_inventory WHERE plaka = $1 GROUP BY bolme_kapak ORDER BY bolme_kapak`,
      [PLAKA]
    );
    console.log('=== vehicle_inventory (ekranın okuduğu tablo) ===');
    console.table(inv.rows);
    const toplam = await pool.query(`SELECT COUNT(*) AS c FROM vehicle_inventory WHERE plaka = $1`, [PLAKA]);
    console.log('Toplam satır:', toplam.rows[0].c);

    // 2. vehicles.bolmeler JSON önbelleği: bölme -> malzeme sayısı
    const veh = await pool.query(`SELECT bolmeler FROM vehicles WHERE plaka = $1`, [PLAKA]);
    console.log('\n=== vehicles.bolmeler (eski JSON önbelleği) ===');
    if (veh.rows[0]) {
      const b = veh.rows[0].bolmeler;
      const obj = typeof b === 'string' ? JSON.parse(b || '{}') : (b || {});
      const ozet = Object.entries(obj).map(([k, v]) => ({ bolme: k, malzeme_sayisi: Array.isArray(v) ? v.length : 0 }));
      console.table(ozet);
      console.log('JSON toplam malzeme:', ozet.reduce((s, o) => s + o.malzeme_sayisi, 0));
    } else {
      console.log('Araç bulunamadı!');
    }

    // 3. Eşleşmeyen inventory_id var mı (ekranda "Bilinmeyen Malzeme" gösterir)
    const orphan = await pool.query(
      `SELECT vi.id, vi.inventory_id, vi.bolme_kapak FROM vehicle_inventory vi
       LEFT JOIN inventory i ON i.id = vi.inventory_id
       WHERE vi.plaka = $1 AND i.id IS NULL`,
      [PLAKA]
    );
    console.log('\n=== Ana tabloda karşılığı olmayan kayıtlar ===');
    console.log(orphan.rows.length === 0 ? 'Yok (temiz)' : orphan.rows);

    // 4. Bu plaka için son envanter işlemleri (audit)
    const audit = await pool.query(
      `SELECT action_type, actor_name, details, created_at FROM audit_logs
       WHERE target = $1 AND action_type IN ('inventory_update','temporary_assignment','temporary_assignment_return')
       ORDER BY created_at DESC LIMIT 5`,
      [PLAKA]
    );
    console.log('\n=== Son envanter denetim kayıtları ===');
    audit.rows.forEach(r => console.log(r.created_at, '|', r.action_type, '|', r.actor_name, '|', JSON.stringify(r.details).slice(0, 160)));
  } catch (e) {
    console.error('HATA:', e.message);
  } finally {
    await pool.end();
  }
})();
