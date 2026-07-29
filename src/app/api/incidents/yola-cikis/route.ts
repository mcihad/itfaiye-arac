import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

/**
 * POST /api/incidents/yola-cikis
 *
 * Saha Modu "Yola Çıktım" kaydı: alarm bildirimine yanıt veren personel,
 * (varsa) seçtiği araçla birlikte olaya otomatik işlenir.
 *
 * Body: { incident_id: string, plaka?: string }
 *
 * Tek transaction içinde:
 *  - incident_personnel: personel olaya eklenir (varsa dokunulmaz)
 *  - incident_vehicles: seçilen araç olaya eklenir (varsa dokunulmaz —
 *    aynı araçla çıkan ikinci kişi yalnızca personel kaydı ekler)
 *  - incidents.ek16_personel / ek16_araclar JSON alanları güncellenir
 *    (EK-16 kapanış formu bu alanlardan beslenir)
 *  - personnel_records: özlük dökümüne saat damgalı "Vaka Çıkışı" düşülür
 *
 * Yetki: oturumu olan HERKES (Er dahil) — kişi yalnızca KENDİ çıkışını
 * işaretler; sicil istemciden alınmaz, JWT oturumundan türetilir.
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const body = await request.json();
    const incidentId = String(body.incident_id || '').trim();
    const plaka = body.plaka ? String(body.plaka).trim().toLocaleUpperCase('tr-TR') : null;

    if (!/^[0-9a-f-]{36}$/i.test(incidentId)) {
      return NextResponse.json({ error: 'Geçersiz olay kimliği.' }, { status: 400 });
    }
    if (plaka && plaka.length > 15) {
      return NextResponse.json({ error: 'Geçersiz plaka.' }, { status: 400 });
    }

    const sicilNo = session.sicilNo;
    const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const bugun = new Date().toLocaleDateString('en-CA');

    const sonuc = await withTransaction(async (tx) => {
      // Olayı kilitle ve EK-16 JSON alanlarını oku
      const inc = await tx<{ olay_turu: string; ek16_personel: string | null; ek16_araclar: string | null }>(
        `SELECT olay_turu, ek16_personel, ek16_araclar FROM incidents WHERE id = $1 FOR UPDATE`,
        [incidentId]
      );
      if (!inc.rows[0]) {
        throw new Error('Olay kaydı bulunamadı.');
      }
      const olayTuru = inc.rows[0].olay_turu || 'Vaka';

      // 1) Personeli olaya işle (mükerrer olursa dokunma)
      await tx(
        `INSERT INTO incident_personnel (incident_id, sicil_no, gorev)
         VALUES ($1, $2, 'Müdahale Personeli')
         ON CONFLICT (incident_id, sicil_no) DO NOTHING`,
        [incidentId, sicilNo]
      );

      // 2) Aracı olaya işle (seçildiyse; mükerrer olursa dokunma)
      if (plaka) {
        await tx(
          `INSERT INTO incident_vehicles (incident_id, plaka, gorev_turu)
           VALUES ($1, $2, 'Müdahale Aracı')
           ON CONFLICT (incident_id, plaka) DO NOTHING`,
          [incidentId, plaka]
        );
      }

      // 3) EK-16 JSON alanlarını güncelle (kapanış formu bunlardan beslenir)
      const parseList = (v: string | null): string[] => {
        try {
          const arr = JSON.parse(v || '[]');
          return Array.isArray(arr) ? arr.map(String) : [];
        } catch {
          return [];
        }
      };
      const pList = parseList(inc.rows[0].ek16_personel);
      const vList = parseList(inc.rows[0].ek16_araclar);
      if (!pList.includes(sicilNo)) pList.push(sicilNo);
      if (plaka && !vList.includes(plaka)) vList.push(plaka);
      await tx(
        `UPDATE incidents SET ek16_personel = $1, ek16_araclar = $2 WHERE id = $3`,
        [JSON.stringify(pList), JSON.stringify(vList), incidentId]
      );

      // 4) Özlük dökümüne saat damgalı çıkış kaydı
      await tx(
        `INSERT INTO personnel_records (sicil_no, kayit_turu, tarih, aciklama)
         VALUES ($1, 'Vaka Çıkışı', $2::date, $3)`,
        [sicilNo, bugun, `${olayTuru} vakasına ${plaka ? plaka + ' aracı ile ' : ''}çıkış yaptı. Saat: ${saat} (Saha Modu — Yola Çıktım)`]
      );

      return { olayTuru };
    });

    return NextResponse.json({
      ok: true,
      message: plaka
        ? `${sonuc.olayTuru} vakasına ${plaka} ile çıkışınız kaydedildi.`
        : `${sonuc.olayTuru} vakasına çıkışınız kaydedildi.`,
    });
  } catch (err: any) {
    console.error('[yola-cikis] Hata:', err);
    const isPgError = typeof err?.code === 'string';
    const msg = !isPgError && err instanceof Error ? err.message : 'Kayıt sırasında sunucu hatası oluştu.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
