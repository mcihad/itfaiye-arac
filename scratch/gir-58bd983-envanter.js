/**
 * 58 BD 983 (Yeni Mercedes Merdiven) gerçek envanter girişi — tek seferlik.
 * Arayüzdeki 'Kaydet' akışının birebir aynısını yapar:
 *   1. Aracın eski (geçici) vehicle_inventory kayıtlarını siler
 *   2. Katalogda olmayan malzemeleri inventory ana tablosuna ekler
 *   3. Yeni satırları yazar
 *   4. vehicles.bolmeler JSON önbelleğini yeniden kurar
 *   5. audit_logs'a inventory_update kaydı düşer
 * Tamamı tek transaction: yarıda kalırsa hiçbir şey değişmez.
 *
 * Kuru çalışma: node scratch/gir-58bd983-envanter.js
 * Uygulama:     node scratch/gir-58bd983-envanter.js --uygula
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const UYGULA = process.argv.includes('--uygula');
const PLAKA = '58 BD 983';

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

// Bölme etiketi → JSON slug (src/lib/constants.ts COMPARTMENT_NAMES ile aynı)
const SLUGS = {
  'Araç Üstü': 'arac_ustu',
  'Araç İçi': 'arac_ici',
  'Sağ Ön Kapak': 'sag_on_kapak',
  'Sağ Arka Kapak': 'sag_arka_kapak',
  'Sol Ön Kapak': 'sol_on_kapak',
  'Sol Arka Kapak': 'sol_arka_kapak',
};

// [bölme, malzeme adı (katalogdaki/kataloğa girecek ad), adet]
const LISTE = [
  // ARAÇ ÜSTÜ
  ['Araç Üstü', 'KÜÇÜK SÜRGÜLÜ MERDİVEN', 1],
  ['Araç Üstü', 'JENERATÖR', 1],
  ['Araç Üstü', 'SEPET SEDYE APARATI', 1],
  // ARAÇ İÇİ
  ['Araç İçi', 'TEMİZ HAVA SOLUNUM CİHAZI', 2],
  ['Araç İçi', '6 KG LIK KKT', 1],
  ['Araç İçi', 'SANDALYE SEDYE', 1],
  ['Araç İçi', 'HOLİGAN', 1],
  ['Araç İçi', 'BÜYÜK BALTA', 1],
  ['Araç İçi', 'EL FENERİ', 1],
  ['Araç İçi', '85 LİK ÇARIK', 1],
  ['Araç İçi', 'SARI REFLEKTÖR', 2],
  ['Araç İçi', 'TEMİZ HAVA SOLUNUM CİHAZI MASKESİ', 2],
  ['Araç İçi', 'BALTALI EMNİYET KEMERİ', 1],
  ['Araç İçi', 'BEL EMNİYET KEMERİ', 2],
  ['Araç İçi', 'KARABİNA', 5],
  ['Araç İçi', 'İSVEÇ OTURAĞI', 1],
  ['Araç İçi', 'KURTARMA İPİ', 4],
  ['Araç İçi', 'KURTARMA BARETİ', 2],
  ['Araç İçi', 'MANEVELA', 1],
  ['Araç İçi', 'İZOLE MAKAS', 1],
  ['Araç İçi', 'DEMİR KESME MAKASI', 1],
  ['Araç İçi', 'SEDYE SABİTLEME KEMERİ', 2],
  ['Araç İçi', 'CESET TORBASI', 1],
  // SAĞ ÖN KAPAK
  ['Sağ Ön Kapak', 'HİDRANT ANAHTARI', 1],
  ['Sağ Ön Kapak', 'REKOR ANAHTARI', 2],
  ['Sağ Ön Kapak', 'DARALTMA', 1],
  ['Sağ Ön Kapak', 'KONİK UÇLU DARALTMA', 1],
  ['Sağ Ön Kapak', 'ARA VANA', 1],
  ['Sağ Ön Kapak', 'DENGE TAKOZU', 2],
  ['Sağ Ön Kapak', '6 KG LIK KKT', 1],
  // SAĞ ARKA KAPAK
  ['Sağ Arka Kapak', '85 LİK HORTUM', 4],
  ['Sağ Arka Kapak', '85 LİK TURBO LANS', 2],
  ['Sağ Arka Kapak', '110 LUK TURBO LANS', 1],
  ['Sağ Arka Kapak', '85 LİK NÜMAYİŞ HORTUM', 1],
  // SOL ÖN KAPAK
  ['Sol Ön Kapak', 'AĞAÇ KESME MOTORU', 1],
  ['Sol Ön Kapak', 'BENZİN BİDONU', 1],
  ['Sol Ön Kapak', 'MAKARALI KABLO', 1],
  ['Sol Ön Kapak', 'ARAÇ TAKOZU', 2],
  ['Sol Ön Kapak', 'FİGRASYON', 1],
  ['Sol Ön Kapak', 'PROJEKTÖR', 2],
  // SOL ARKA KAPAK
  ['Sol Arka Kapak', '110 LUK HORTUM', 3],
  ['Sol Arka Kapak', 'DENGE TAKOZU', 2],
];

const trUp = (s) => String(s || '').trim().toLocaleUpperCase('tr-TR');

const pool = new Pool({ connectionString: env.DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    console.log(UYGULA ? '>>> UYGULAMA MODU\n' : '>>> KURU ÇALIŞMA (yazma yok)\n');

    const master = await client.query(`SELECT id, malzeme_adi FROM inventory`);
    const masterMap = {};
    master.rows.forEach(r => { masterMap[trUp(r.malzeme_adi)] = { id: r.id, ad: r.malzeme_adi }; });

    // Ön kontrol raporu: hangi ad mevcut kataloğa bağlanacak, hangisi yeni açılacak
    const yeniAcilacak = new Set();
    for (const [, ad] of LISTE) {
      const m = masterMap[trUp(ad)];
      if (!m) yeniAcilacak.add(ad);
    }
    console.log('Katalogda mevcut olup yeniden kullanılacak:',
      [...new Set(LISTE.map(([, a]) => a))].filter(a => masterMap[trUp(a)]).length, 'ad');
    console.log('Kataloğa YENİ eklenecek:', [...yeniAcilacak].join(', ') || '(yok)');
    console.log(`Toplam satır: ${LISTE.length}\n`);

    await client.query('BEGIN');
    try {
      const eski = await client.query(`DELETE FROM vehicle_inventory WHERE plaka = $1 RETURNING id`, [PLAKA]);
      console.log(`Silinen geçici kayıt: ${eski.rowCount}`);

      const bolmeler = {};
      for (const [bolme, ad, adet] of LISTE) {
        let m = masterMap[trUp(ad)];
        if (!m) {
          const ins = await client.query(`INSERT INTO inventory (malzeme_adi) VALUES ($1) RETURNING id`, [ad]);
          m = { id: ins.rows[0].id, ad };
          masterMap[trUp(ad)] = m;
          console.log(`  + Katalog: ${ad} (id: ${m.id})`);
        }
        await client.query(
          `INSERT INTO vehicle_inventory (plaka, inventory_id, adet, durum, bolme_kapak)
           VALUES ($1, $2, $3, 'Tam', $4)`,
          [PLAKA, m.id, adet, bolme]
        );
        const slug = SLUGS[bolme] || bolme.replace(/\s+/g, '_').toLowerCase();
        if (!bolmeler[slug]) bolmeler[slug] = [];
        bolmeler[slug].push({ malzeme: m.ad, adet, durum: 'Tam' });
      }

      await client.query(`UPDATE vehicles SET bolmeler = $1 WHERE plaka = $2`, [JSON.stringify(bolmeler), PLAKA]);

      // Denetim kaydı (arayüzün yazdığı biçimde)
      const aktor = await client.query(
        `SELECT sicil_no, ad, soyad FROM personnel WHERE rol = 'Admin' AND aktif = true ORDER BY created_at LIMIT 1`
      );
      const a = aktor.rows[0] || { sicil_no: 'SYSTEM', ad: 'Elle', soyad: 'Giriş' };
      await client.query(
        `INSERT INTO audit_logs (action_type, actor_sicil_no, actor_name, target, details)
         VALUES ('inventory_update', $1, $2, $3, $4)`,
        [a.sicil_no, `${a.ad} ${a.soyad}`, PLAKA,
         JSON.stringify({ total_items: LISTE.length, compartments: Object.keys(bolmeler), kaynak: 'Elle giriş (58 BD 983 gerçek envanter)' })]
      );

      if (UYGULA) {
        await client.query('COMMIT');
        console.log(`\n✅ ${LISTE.length} satır yazıldı, bölme önbelleği ve denetim kaydı güncellendi.`);
      } else {
        await client.query('ROLLBACK');
        console.log(`\nKuru çalışma bitti (geri alındı). Uygulamak için: node scratch/gir-58bd983-envanter.js --uygula`);
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
