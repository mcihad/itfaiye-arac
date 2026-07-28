/**
 * TEK SEFERLİK ONARIM: vehicles.bolmeler JSON önbelleğinde olup vehicle_inventory
 * tablosuna hiç taşınmamış malzemeleri tabloya EKLER.
 *
 * - YALNIZCA EKLEME yapar; mevcut satırları silmez/değiştirmez.
 * - Eşleşme bölme+malzeme adı bazındadır (aynı bölmede aynı adla kayıt varsa atlanır).
 * - inventory ana tablosunda adı olmayan malzemeler önce oraya eklenir.
 * - Önce KURU ÇALIŞMA yapar; gerçek yazma için --uygula bayrağı gerekir:
 *     node scratch/onar-envanter-eksikleri.js            (yalnızca rapor)
 *     node scratch/onar-envanter-eksikleri.js --uygula   (veritabanına yazar)
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const UYGULA = process.argv.includes('--uygula');

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

// src/lib/constants.ts COMPARTMENT_NAMES ile aynı eşleme (slug → görünen ad)
const COMPARTMENT_NAMES = {
  kabin_ici: 'Kabin İçi',
  arac_ici: 'Araç İçi',
  sol_on_kapak: 'Sol Ön Kapak',
  sol_orta_kapak: 'Sol Orta Kapak',
  sol_arka_kapak: 'Sol Arka Kapak',
  sag_on_kapak: 'Sağ Ön Kapak',
  sag_orta_kapak: 'Sağ Orta Kapak',
  sag_arka_kapak: 'Sağ Arka Kapak',
  arac_ustu: 'Araç Üstü',
  arka_bolme: 'Arka Bölme',
  arka_kapak: 'Arka Kapak',
  sol_dolap: 'Sol Malzeme Dolabı',
  sag_dolap: 'Sağ Malzeme Dolabı',
  bagaj_ici: 'Bagaj İçi',
  kasa_ici: 'Kasa İçi',
};

const pool = new Pool({ connectionString: env.DATABASE_URL });

// Yalnızca eksik verisi doğrulanan araçlar onarılır (GARAJ/ANA_DEPO gibi sanal
// plakalar bölme adı yazım farkı yüzünden yanlış pozitif veriyor — kapsam dışı).
const ONARILACAK_PLAKALAR = new Set(['58 ACU 765', '58 FR 021']);

// Bölme+malzeme eşleşmesi Türkçe harf duyarsız yapılır ('garaj' ↔ 'Garaj')
const anahtarYap = (bolme, malzeme) =>
  `${String(bolme).toLocaleUpperCase('tr-TR')}||${String(malzeme).toLocaleUpperCase('tr-TR')}`;

(async () => {
  const client = await pool.connect();
  try {
    console.log(UYGULA ? '>>> UYGULAMA MODU: veritabanına yazılacak\n' : '>>> KURU ÇALIŞMA: yalnızca rapor, yazma yok\n');

    const vehs = await client.query(`SELECT plaka, bolmeler FROM vehicles WHERE plaka IS NOT NULL`);
    const master = await client.query(`SELECT id, malzeme_adi FROM inventory`);
    const masterMap = {};
    master.rows.forEach(r => { masterMap[r.malzeme_adi.toUpperCase()] = r.id; });

    let toplamEklenecek = 0;

    await client.query('BEGIN');
    try {
      for (const v of vehs.rows) {
        if (!ONARILACAK_PLAKALAR.has(v.plaka)) continue;
        const b = typeof v.bolmeler === 'string' ? JSON.parse(v.bolmeler || '{}') : (v.bolmeler || {});
        if (!b || Object.keys(b).length === 0) continue;

        // Tablodaki mevcut (bölme, malzeme) çiftleri
        const mevcut = await client.query(
          `SELECT vi.bolme_kapak, i.malzeme_adi FROM vehicle_inventory vi
           JOIN inventory i ON i.id = vi.inventory_id WHERE vi.plaka = $1`,
          [v.plaka]
        );
        const mevcutSet = new Set(mevcut.rows.map(r => anahtarYap(r.bolme_kapak, r.malzeme_adi)));

        for (const [slug, items] of Object.entries(b)) {
          if (!Array.isArray(items)) continue;
          const bolmeAdi = COMPARTMENT_NAMES[slug] || slug;

          for (const it of items) {
            const ad = String(it.malzeme || '').trim();
            if (!ad) continue;
            const anahtar = anahtarYap(bolmeAdi, ad);
            if (mevcutSet.has(anahtar)) continue;

            toplamEklenecek++;
            console.log(`${v.plaka} | ${bolmeAdi} | ${ad} (adet: ${it.adet ?? 1}, durum: ${it.durum || 'Tam'})`);

            if (UYGULA) {
              let invId = masterMap[ad.toUpperCase()];
              if (!invId) {
                const ins = await client.query(
                  `INSERT INTO inventory (malzeme_adi) VALUES ($1) RETURNING id`, [ad]
                );
                invId = ins.rows[0].id;
                masterMap[ad.toUpperCase()] = invId;
                console.log(`   -> Ana tabloya yeni malzeme eklendi: ${ad} (id: ${invId})`);
              }
              await client.query(
                `INSERT INTO vehicle_inventory (plaka, inventory_id, adet, durum, bolme_kapak)
                 VALUES ($1, $2, $3, $4, $5)`,
                [v.plaka, invId, Number(it.adet) || 1, it.durum || 'Tam', bolmeAdi]
              );
              mevcutSet.add(anahtar);
            }
          }
        }
      }

      if (UYGULA) {
        await client.query('COMMIT');
        console.log(`\n✅ ${toplamEklenecek} kayıt vehicle_inventory tablosuna eklendi (transaction commit edildi).`);
      } else {
        await client.query('ROLLBACK');
        console.log(`\nKuru çalışma bitti: ${toplamEklenecek} kayıt eklenecek. Uygulamak için: node scratch/onar-envanter-eksikleri.js --uygula`);
      }
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } catch (e) {
    console.error('HATA (hiçbir değişiklik yapılmadı):', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
