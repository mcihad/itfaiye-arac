import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

type Tx = <R extends import('pg').QueryResultRow = any>(text: string, params?: any[]) => Promise<import('pg').QueryResult<R>>;

// service_applications tablosu her kurulumda bulunmayabilir; transaction içinde
// başarısız bir UPDATE tüm işlemi iptal ettiğinden (25P02) önce varlığı kontrol edilir.
async function serviceApplicationsExists(tx: Tx): Promise<boolean> {
  const r = await tx<{ t: string | null }>(`SELECT to_regclass('public.service_applications') AS t`);
  return !!r.rows[0]?.t;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Backend ACL Shield: Verify Müdür/Admin credentials
    const session = getSessionFromRequest(request);
    const isMudur = session && (session.rol === 'Admin' || session.unvan === 'Müdür' || session.rol?.toLowerCase() === 'admin' || session.unvan?.toLowerCase() === 'müdür');

    if (!isMudur) {
      console.warn(`[ACL API Shield] Unauthorized services approval attempt from: ${session ? session.sicilNo : 'Guest'}`);
      return NextResponse.json(
        { success: false, error: 'Yetkisiz erişim: Bu işlem sadece Müdür rütbesine sahip personel tarafından gerçekleştirilebilir.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, durum, islem_yapan_amir, atanan_ekip, red_gerekcesi } = body;

    if (!id || !durum) {
      return NextResponse.json({ success: false, error: 'ID ve Durum alanları zorunludur.' }, { status: 400 });
    }

    const serviceDurum = durum === 'ONAYLANDI' ? 'true' : durum === 'REDDEDİLDİ' ? 'false' : durum;

    await withTransaction(async (tx) => {
      if (typeof id === 'string' && id.startsWith('baca-')) {
        // Special table ID
        const serialId = parseInt(id.split('-')[1], 10);

        // 1. Fetch tracking code from special table
        const row = await tx<{ takip_kodu: string }>('SELECT takip_kodu FROM public.baca_temizlik_basvurulari WHERE id = $1', [serialId]);
        if (row.rows.length === 0) {
          throw new Error('Baca temizliği başvurusu bulunamadı.');
        }
        const trackingCode = row.rows[0].takip_kodu;

        // 2. Update special table
        await tx(
          `UPDATE public.baca_temizlik_basvurulari
           SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
           WHERE id = $5`,
          [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, serialId]
        );

        // 3. Update main table
        await tx(
          `UPDATE public.citizen_requests
           SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
           WHERE basvuran_tc = $5`,
          [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
        );

        // 4. Update service_applications if it exists
        if (await serviceApplicationsExists(tx)) {
          await tx(
            `UPDATE public.service_applications
             SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
             WHERE takip_kodu = $5`,
            [serviceDurum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
          );
        }

      } else if (typeof id === 'string' && id.startsWith('yangin-')) {
        // Special table ID
        const serialId = parseInt(id.split('-')[1], 10);

        // 1. Fetch tracking code from special table
        const row = await tx<{ takip_kodu: string }>('SELECT takip_kodu FROM public.yangin_rapor_basvurulari WHERE id = $1', [serialId]);
        if (row.rows.length === 0) {
          throw new Error('İtfaiye uygunluk raporu başvurusu bulunamadı.');
        }
        const trackingCode = row.rows[0].takip_kodu;

        // 2. Update special table
        await tx(
          `UPDATE public.yangin_rapor_basvurulari
           SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
           WHERE id = $5`,
          [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, serialId]
        );

        // 3. Update main table
        await tx(
          `UPDATE public.citizen_requests
           SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
           WHERE basvuran_tc = $5`,
          [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
        );

        // 4. Update service_applications if it exists
        if (await serviceApplicationsExists(tx)) {
          await tx(
            `UPDATE public.service_applications
             SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
             WHERE takip_kodu = $5`,
            [serviceDurum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
          );
        }

      } else if (typeof id === 'string' && id.startsWith('service-')) {
        // service_applications table ID
        const serialId = parseInt(id.split('-')[1], 10);

        // 1. Fetch tracking code
        const row = await tx<{ takip_kodu: string }>('SELECT takip_kodu FROM public.service_applications WHERE id = $1', [serialId]);
        if (row.rows.length === 0) {
          throw new Error('Hizmet uygunluk başvurusu bulunamadı.');
        }
        const trackingCode = row.rows[0].takip_kodu;

        // 2. Update service_applications
        await tx(
          `UPDATE public.service_applications
           SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
           WHERE id = $5`,
          [serviceDurum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, serialId]
        );

        // 3. Update main table
        await tx(
          `UPDATE public.citizen_requests
           SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
           WHERE basvuran_tc = $5`,
          [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
        );

        // 4. Update special compat tables
        if (trackingCode.startsWith('SVS-BACA-')) {
          await tx(
            `UPDATE public.baca_temizlik_basvurulari
             SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
             WHERE takip_kodu = $5`,
            [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
          );
        } else if (trackingCode.startsWith('SVS-YANGIN-')) {
          await tx(
            `UPDATE public.yangin_rapor_basvurulari
             SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
             WHERE takip_kodu = $5`,
            [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
          );
        }

      } else {
        // UUID - Direct table ID (citizen_requests)
        // 1. Fetch tracking code (basvuran_tc) from citizen_requests
        const row = await tx<{ basvuran_tc: string }>('SELECT basvuran_tc FROM public.citizen_requests WHERE id = $1', [id]);
        if (row.rows.length === 0) {
          throw new Error('Vatandaş başvurusu bulunamadı.');
        }
        const trackingCode = row.rows[0].basvuran_tc;

        // 2. Update main table
        await tx(
          `UPDATE public.citizen_requests
           SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
           WHERE id = $5`,
          [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, id]
        );

        // 3. If trackingCode corresponds to a special table, update that as well
        if (trackingCode) {
          if (trackingCode.startsWith('SVS-BACA-')) {
            await tx(
              `UPDATE public.baca_temizlik_basvurulari
               SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
               WHERE takip_kodu = $5`,
              [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
            );
          } else if (trackingCode.startsWith('SVS-YANGIN-')) {
            await tx(
              `UPDATE public.yangin_rapor_basvurulari
               SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
               WHERE takip_kodu = $5`,
              [durum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
            );
          }

          // Update service_applications as well
          if (await serviceApplicationsExists(tx)) {
            await tx(
              `UPDATE public.service_applications
               SET durum = $1, islem_yapan_amir = $2, atanan_ekip = $3, red_gerekcesi = $4, islem_tarihi = NOW()
               WHERE takip_kodu = $5`,
              [serviceDurum, islem_yapan_amir || null, atanan_ekip || null, red_gerekcesi || null, trackingCode]
            );
          }
        }
      }

      // 4. Sunucu taraflı parametrik audit logging (official decision trail)
      await tx(
        `INSERT INTO public.audit_logs (action_type, actor_sicil_no, actor_name, target, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'hizmet_basvuru_karar',
          session.sicilNo,
          `${session.ad} ${session.soyad}`,
          String(id),
          JSON.stringify({ durum, islem_yapan_amir, atanan_ekip, red_gerekcesi })
        ]
      );
    });

    return NextResponse.json({ success: true, message: 'Başvuru durumu başarıyla güncellendi.' });
  } catch (err: unknown) {
    console.error('[hizmet-onay/POST] Hata:', err);
    // Bilinçli fırlatılan iş kuralı mesajları istemciye gider; pg/SQL hataları
    // (code alanı taşır) şema detayı sızdırmamak için genelleştirilir.
    const isPgError = typeof (err as any)?.code === 'string';
    const msg = !isPgError && err instanceof Error ? err.message : 'İşlem tamamlanamadı. Ayrıntılar sistem loguna kaydedildi.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const isMudur = session && (session.rol === 'Admin' || session.unvan === 'Müdür' || session.rol?.toLowerCase() === 'admin' || session.unvan?.toLowerCase() === 'müdür');

    if (!isMudur) {
      console.warn(`[ACL API Shield] Unauthorized services delete attempt from: ${session ? session.sicilNo : 'Guest'}`);
      return NextResponse.json(
        { success: false, error: 'Yetkisiz erişim: Bu işlem sadece Müdür rütbesine sahip personel tarafından gerçekleştirilebilir.' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID parametresi zorunludur.' }, { status: 400 });
    }

    await withTransaction(async (tx) => {
      let trackingCode = '';
      const hasServiceApps = await serviceApplicationsExists(tx);

      if (typeof id === 'string' && id.startsWith('service-')) {
        const serialId = parseInt(id.split('-')[1], 10);
        if (hasServiceApps) {
          const row = await tx<{ takip_kodu: string }>('SELECT takip_kodu FROM public.service_applications WHERE id = $1', [serialId]);
          if (row.rows.length > 0) {
            trackingCode = row.rows[0].takip_kodu;
          }
          await tx('DELETE FROM public.service_applications WHERE id = $1', [serialId]);
        }
      } else if (typeof id === 'string' && id.startsWith('baca-')) {
        const serialId = parseInt(id.split('-')[1], 10);
        const row = await tx<{ takip_kodu: string }>('SELECT takip_kodu FROM public.baca_temizlik_basvurulari WHERE id = $1', [serialId]);
        if (row.rows.length > 0) {
          trackingCode = row.rows[0].takip_kodu;
        }
        await tx('DELETE FROM public.baca_temizlik_basvurulari WHERE id = $1', [serialId]);
      } else if (typeof id === 'string' && id.startsWith('yangin-')) {
        const serialId = parseInt(id.split('-')[1], 10);
        const row = await tx<{ takip_kodu: string }>('SELECT takip_kodu FROM public.yangin_rapor_basvurulari WHERE id = $1', [serialId]);
        if (row.rows.length > 0) {
          trackingCode = row.rows[0].takip_kodu;
        }
        await tx('DELETE FROM public.yangin_rapor_basvurulari WHERE id = $1', [serialId]);
      } else {
        const row = await tx<{ basvuran_tc: string }>('SELECT basvuran_tc FROM public.citizen_requests WHERE id = $1', [id]);
        if (row.rows.length > 0) {
          trackingCode = row.rows[0].basvuran_tc;
        }
        await tx('DELETE FROM public.citizen_requests WHERE id = $1', [id]);
      }

      if (trackingCode) {
        if (hasServiceApps) {
          await tx('DELETE FROM public.service_applications WHERE takip_kodu = $1', [trackingCode]);
        }
        await tx('DELETE FROM public.citizen_requests WHERE basvuran_tc = $1', [trackingCode]);
        await tx('DELETE FROM public.baca_temizlik_basvurulari WHERE takip_kodu = $1', [trackingCode]);
        await tx('DELETE FROM public.yangin_rapor_basvurulari WHERE takip_kodu = $1', [trackingCode]);
      }

      await tx(
        `INSERT INTO public.audit_logs (action_type, actor_sicil_no, actor_name, target, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'hizmet_basvuru_sil',
          session.sicilNo,
          `${session.ad} ${session.soyad}`,
          String(id),
          JSON.stringify({ trackingCode })
        ]
      );
    });

    return NextResponse.json({ success: true, message: 'Başvuru başarıyla silindi.' });
  } catch (err: unknown) {
    console.error('[hizmet-onay/DELETE] Hata:', err);
    const isPgError = typeof (err as any)?.code === 'string';
    const msg = !isPgError && err instanceof Error ? err.message : 'İşlem tamamlanamadı. Ayrıntılar sistem loguna kaydedildi.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
