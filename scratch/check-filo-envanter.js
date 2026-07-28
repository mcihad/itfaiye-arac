/**
 * SALT OKUNUR filo envanter denetimi. Hiçbir şey yazmaz.
 * 1. JSON önbelleği ↔ vehicle_inventory bölme+malzeme bazında karşılaştırma
 *    (harf duyarsız; iki yönlü: JSON'da olup tabloda olmayan VE tersi)
 * 2. Ana katalogda karşılığı olmayan vehicle_inventory kayıtları (yetim)
 * 3. Mükerrer satırlar (aynı plaka+bölme+malzeme birden fazla kez)
 * 4. Hem tablosu hem JSON'u boş araçlar
 */
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

const COMPARTMENT_NAMES = {
  kabin_ici: 'Kabin İçi', arac_ici: 'Araç İçi',
  sol_on_kapak: 'Sol Ön Kapak', sol_orta_kapak: 'Sol Orta Kapak', sol_arka_kapak: 'Sol Arka Kapak',
  sag_on_kapak: 'Sağ Ön Kapak', sag_orta_kapak: 'Sağ Orta Kapak', sag_arka_kapak: 'Sağ Arka Kapak',
  arac_ustu: 'Araç Üstü', arka_bolme: 'Arka Bölme', arka_kapak: 'Arka Kapak',
  sol_dolap: 'Sol Malzeme Dolabı', sag_dolap: 'Sağ Malzeme Dolabı',
  bagaj_ici: 'Bagaj İçi', kasa_ici: 'Kasa İçi',
  garaj: 'Garaj', ana_depo: 'Ana Depo',
};

// Alt çizgi/boşluk farkları eşitlenir: 'halat_çantası' ↔ 'Halat Çantası'
const up = (s) => String(s || '').trim().replace(/[_\s]+/g, ' ').toLocaleUpperCase('tr-TR');
const anahtar = (bolme, malzeme) => `${up(bolme)}||${up(malzeme)}`;

const pool = new Pool({ connectionString: env.DATABASE_URL });

(async () => {
  try {
    const vehs = await pool.query(`SELECT plaka, bolmeler FROM vehicles WHERE plaka IS NOT NULL ORDER BY plaka`);
    const inv = await pool.query(
      `SELECT vi.plaka, vi.bolme_kapak, vi.adet, i.malzeme_adi
       FROM vehicle_inventory vi LEFT JOIN inventory i ON i.id = vi.inventory_id`
    );

    // Tablo verisini plaka bazında grupla
    const tabloMap = {};
    inv.rows.forEach(r => {
      if (!tabloMap[r.plaka]) tabloMap[r.plaka] = [];
      tabloMap[r.plaka].push(r);
    });

    let sorunluArac = 0;

    for (const v of vehs.rows) {
      const b = typeof v.bolmeler === 'string' ? JSON.parse(v.bolmeler || '{}') : (v.bolmeler || {});
      const tabloRows = tabloMap[v.plaka] || [];

      const jsonPairs = new Map(); // anahtar -> {bolme, malzeme, adet}
      for (const [slug, items] of Object.entries(b || {})) {
        if (!Array.isArray(items)) continue;
        const bolmeAdi = COMPARTMENT_NAMES[slug] || slug;
        items.forEach(it => {
          if (String(it.malzeme || '').trim()) jsonPairs.set(anahtar(bolmeAdi, it.malzeme), { bolme: bolmeAdi, malzeme: it.malzeme, adet: it.adet });
        });
      }
      const tabloPairs = new Map();
      tabloRows.forEach(r => {
        if (r.malzeme_adi) tabloPairs.set(anahtar(r.bolme_kapak, r.malzeme_adi), { bolme: r.bolme_kapak, malzeme: r.malzeme_adi, adet: r.adet });
      });

      const jsondaVarTablodaYok = [...jsonPairs.entries()].filter(([k]) => !tabloPairs.has(k)).map(([, v2]) => v2);
      const tablodaVarJsondaYok = [...tabloPairs.entries()].filter(([k]) => !jsonPairs.has(k)).map(([, v2]) => v2);

      const bosMu = tabloRows.length === 0 && jsonPairs.size === 0;
      if (jsondaVarTablodaYok.length === 0 && tablodaVarJsondaYok.length === 0 && !bosMu) continue;

      sorunluArac++;
      console.log(`\n══ ${v.plaka} ══ (tablo: ${tabloRows.length} satır, json: ${jsonPairs.size} kalem)`);
      if (bosMu) { console.log('  ⚠️ Envanteri tamamen boş (hem tablo hem eski kayıt)'); continue; }
      if (jsondaVarTablodaYok.length > 0) {
        console.log(`  ❌ Eski kayıtta olup EKRANDA GÖRÜNMEYEN (${jsondaVarTablodaYok.length}):`);
        jsondaVarTablodaYok.forEach(x => console.log(`     - [${x.bolme}] ${x.malzeme} (adet: ${x.adet ?? '?'})`));
      }
      if (tablodaVarJsondaYok.length > 0) {
        console.log(`  ℹ️ Ekranda olup eski kayıtta olmayan (${tablodaVarJsondaYok.length}) — sonradan eklenmiş olabilir, sorun değil:`);
        tablodaVarJsondaYok.slice(0, 8).forEach(x => console.log(`     - [${x.bolme}] ${x.malzeme} (adet: ${x.adet ?? '?'})`));
        if (tablodaVarJsondaYok.length > 8) console.log(`     ... ve ${tablodaVarJsondaYok.length - 8} tane daha`);
      }
    }

    console.log(`\n════ ÖZET ════`);
    console.log(`İncelenen araç: ${vehs.rows.length} | Fark/boşluk bulunan: ${sorunluArac}`);

    // Yetim kayıtlar
    const orphan = await pool.query(
      `SELECT vi.plaka, vi.inventory_id, vi.bolme_kapak FROM vehicle_inventory vi
       LEFT JOIN inventory i ON i.id = vi.inventory_id WHERE i.id IS NULL`
    );
    console.log(`Ana katalogda karşılığı olmayan (yetim) kayıt: ${orphan.rows.length}`);
    orphan.rows.slice(0, 10).forEach(r => console.log(`  - ${r.plaka} [${r.bolme_kapak}] inventory_id=${r.inventory_id}`));

    // Mükerrer satırlar
    const dup = await pool.query(
      `SELECT plaka, bolme_kapak, inventory_id, COUNT(*) AS c FROM vehicle_inventory
       GROUP BY plaka, bolme_kapak, inventory_id HAVING COUNT(*) > 1 ORDER BY c DESC`
    );
    console.log(`Mükerrer satır grubu (aynı plaka+bölme+malzeme): ${dup.rows.length}`);
    for (const r of dup.rows.slice(0, 10)) {
      const ad = await pool.query(`SELECT malzeme_adi FROM inventory WHERE id = $1`, [r.inventory_id]);
      console.log(`  - ${r.plaka} [${r.bolme_kapak}] ${ad.rows[0]?.malzeme_adi || r.inventory_id} × ${r.c} kayıt`);
    }
  } catch (e) {
    console.error('HATA:', e.message);
  } finally {
    await pool.end();
  }
})();
