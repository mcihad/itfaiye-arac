import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// Otomatik tablo oluşturma yardımcıları (KVKK Temizliği Yapıldı)
async function ensureTablesExist() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS public.baca_temizlik_basvurulari (
        id SERIAL PRIMARY KEY,
        takip_kodu VARCHAR(50) UNIQUE NOT NULL,
        ad_soyad VARCHAR(100) NOT NULL,
        telefon VARCHAR(20) NOT NULL,
        adres TEXT NOT NULL,
        bina_tipi VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS public.yangin_rapor_basvurulari (
        id SERIAL PRIMARY KEY,
        takip_kodu VARCHAR(50) UNIQUE NOT NULL,
        ad_soyad VARCHAR(100) NOT NULL,
        telefon VARCHAR(20) NOT NULL,
        adres TEXT NOT NULL,
        bina_tipi VARCHAR(50) NOT NULL,
        isyeri_adi_turu VARCHAR(150) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS public.service_applications (
        id SERIAL PRIMARY KEY,
        takip_kodu VARCHAR(50) UNIQUE NOT NULL,
        talep_turu VARCHAR(100) NOT NULL,
        basvuran_tc VARCHAR(11) NOT NULL,
        basvuran_ad VARCHAR(100) NOT NULL,
        basvuran_soyad VARCHAR(100) NOT NULL,
        basvuran_dogum_yili INTEGER NOT NULL,
        irtibat_tel VARCHAR(20) NOT NULL,
        adres TEXT NOT NULL,
        bina_tipi VARCHAR(100),
        isyeri_adi_turu VARCHAR(200),
        durum VARCHAR(50) DEFAULT 'BEKLEMEDE',
        islem_yapan_amir VARCHAR(150),
        atanan_ekip VARCHAR(150),
        islem_tarihi TIMESTAMPTZ,
        red_gerekcesi TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS public.temp_otps (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        tc VARCHAR(11) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 minutes',
        used BOOLEAN DEFAULT FALSE
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS public.blacklist_institutions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kurum_adi VARCHAR NOT NULL,
        telefon VARCHAR UNIQUE NOT NULL,
        gerekce TEXT,
        yasaklama_tarihi DATE NOT NULL DEFAULT CURRENT_DATE,
        aktif_durum BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const tables = ['baca_temizlik_basvurulari', 'yangin_rapor_basvurulari', 'citizen_requests'];
    for (const table of tables) {
      await query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS durum VARCHAR(50) DEFAULT 'BEKLEMEDE'`);
      await query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS islem_yapan_amir VARCHAR(150)`);
      await query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS atanan_ekip VARCHAR(150)`);
      await query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS islem_tarihi TIMESTAMPTZ`);
      await query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS red_gerekcesi TEXT`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[citizen-requests] Tablo oluşturma hatası:', msg);
  }
}

// Türkçe karakterleri her ortamda (locale desteği eksik sunucularda dahi) doğru şekilde büyük harfe dönüştüren yardımcı fonksiyon
function toTurkishUpperCase(str: string): string {
  const map: { [key: string]: string } = {
    'i': 'İ',
    'ı': 'I',
    'ş': 'Ş',
    'ğ': 'Ğ',
    'ç': 'Ç',
    'ö': 'Ö',
    'ü': 'Ü'
  };
  return str.split('').map(char => map[char] || char.toUpperCase()).join('');
}

// Test/demo kimlik bypass'ı ve NVİ servis kesintisinde fail-open davranışı yalnızca
// üretim DIŞI ortamlarda izinlidir. Üretimde bu kalkanlar KOŞULSUZ kapalıdır:
// sahte/test TC'ler reddedilir, servis erişilemezse başvuru fail-closed reddedilir
// ve OTP asla HTTP yanıtında dönmez. ALLOW_TEST_IDENTITY env değişkeni üretimde
// YOK SAYILIR — yanlışlıkla (veya kötü niyetle) set edilmesi vatandaş kimlik
// doğrulamasını baypas edemesin diye.
const ALLOW_TEST_IDENTITY = process.env.NODE_ENV !== 'production';
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_IDENTITY === 'true') {
  console.warn(
    '[citizen-requests] UYARI: ALLOW_TEST_IDENTITY=true üretim ortamında YOK SAYILDI. ' +
    'Kimlik doğrulama kalkanları etkin kalıyor. Bu değişkeni üretim env\'inden kaldırın.'
  );
}

/**
 * OTP kodunu Sivas Belediyesi SMS API'si üzerinden gönderir.
 * Başarılıysa true döner. SMS anahtarları tanımlı değilse false döner
 * (bu durumda OTP yalnızca üretim dışı ortamda ekrana simüle edilebilir).
 */
async function sendOtpSms(phoneNumber: string, otp: string): Promise<boolean> {
  const apiKey = process.env.SMS_API_KEY;
  const apiSecret = process.env.SMS_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.warn('[citizen-requests] SMS_API_KEY/SMS_API_SECRET tanımlı değil — OTP SMS gönderilemedi.');
    return false;
  }
  try {
    const res = await fetch('https://bildirim.sivas.bel.tr/api/v1/sms-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'X-Api-Secret': apiSecret,
      },
      body: JSON.stringify({
        phoneNumber,
        content: `Sivas Itfaiye basvuru dogrulama kodunuz: ${otp}. Kod 5 dakika gecerlidir.`,
      }),
    });
    if (!res.ok) {
      console.error('[citizen-requests] OTP SMS gönderimi başarısız:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[citizen-requests] OTP SMS gönderim hatası:', err);
    return false;
  }
}

// SOAP NVİ Kimlik Doğrulama Fonksiyonu
async function validateNVI(tc: string, ad: string, soyad: string, dogum_yili: number): Promise<boolean> {
  const cleanTc = tc.trim();
  const cleanAd = ad.trim().toLocaleUpperCase('tr-TR');
  const cleanSoy = soyad.trim().toLocaleUpperCase('tr-TR');

  // Test amaçlı sahte T.C. kimlik numaraları / sunum modları için mock kalkanı
  // (YALNIZCA üretim dışı ortamlarda etkin).
  if (
    ALLOW_TEST_IDENTITY && (
    cleanTc === '11111111111' ||
    cleanTc === '22222222222' ||
    cleanTc === '33333333333' ||
    cleanTc === '44444444444' ||
    cleanTc === '55555555555' ||
    cleanTc === '66666666666' ||
    cleanTc === '77777777777' ||
    cleanTc === '88888888888' ||
    cleanTc === '99999999999' ||
    cleanTc === '12345678901' ||
    cleanTc.startsWith('0000') ||
    cleanAd.includes('TEST') ||
    cleanAd.includes('MOCK') ||
    cleanAd.includes('DEMO') ||
    cleanSoy.includes('TEST') ||
    cleanSoy.includes('MOCK') ||
    cleanSoy.includes('DEMO'))
  ) {
    console.log(`[NVİ Mock] Test/Sahte veri tespiti (${tc} - ${ad} ${soyad}). Test kalkanı (üretim dışı) devrede.`);
    return true;
  }

  try {
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <TCKimlikNoDogrula xmlns="http://tckimlik.nvi.gov.tr/WS">
      <TCKimlikNo>${tc}</TCKimlikNo>
      <Ad>${cleanAd}</Ad>
      <Soyad>${cleanSoy}</Soyad>
      <DogumYili>${dogum_yili}</DogumYili>
    </TCKimlikNoDogrula>
  </soap:Body>
</soap:Envelope>`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 saniye timeout

    const response = await fetch('https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tckimlik.nvi.gov.tr/WS/TCKimlikNoDogrula'
      },
      body: soapEnvelope,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`NVİ SOAP servisi HTTP hata kodu döndürdü: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const xmlText = await response.text();

    if (contentType.includes('text/html') || !xmlText.includes('TCKimlikNoDogrulaResult')) {
      console.warn('[NVİ Servis Kesintisi] NVİ SOAP servisi geçersiz yanıt döndürdü. Fail-open yalnızca üretim dışında etkin.');
      return ALLOW_TEST_IDENTITY; // Üretimde fail-closed (reddet); geliştirmede geç
    }

    if (xmlText.includes('<TCKimlikNoDogrulaResult>true</TCKimlikNoDogrulaResult>')) {
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[NVİ SOAP Hatası] İstek başarısız oldu veya zaman aşımına uğradı. Fail-open yalnızca üretim dışında etkin:', err);
    return ALLOW_TEST_IDENTITY; // Üretimde fail-closed (reddet); geliştirmede geç
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTablesExist();
    const body = await request.json();
    const action = body.action;
    const year = new Date().getFullYear();

    // 1. ADIM: OTP Gönderimi (NVİ Doğrulamalı)
    if (action === 'send-otp') {
      const { tc, ad, soyad, dogum_yili, telefon } = body;
      if (!tc || !ad || !soyad || !dogum_yili || !telefon) {
        return NextResponse.json({ error: 'TC Kimlik No, Ad, Soyad, Doğum Yılı ve Telefon alanları zorunludur.' }, { status: 400 });
      }

      // Kara Liste (Blacklist) Kontrolü
      const blacklisted = await queryOne(`
        SELECT id FROM public.blacklist_institutions 
        WHERE telefon = $1 AND aktif_durum = true
      `, [telefon.trim()]);

      if (blacklisted) {
        return NextResponse.json({ error: "Kurumunuz idari gerekçelerle kara listededir. Başvuru yapamazsınız." }, { status: 400 });
      }

      const upperAd = toTurkishUpperCase(ad.trim()).toLocaleUpperCase('tr-TR');
      const upperSoyad = toTurkishUpperCase(soyad.trim()).toLocaleUpperCase('tr-TR');

      // NVİ Kimlik Doğrulama
      const isIdentityValid = await validateNVI(tc, upperAd, upperSoyad, parseInt(dogum_yili, 10));
      if (!isIdentityValid) {
        return NextResponse.json({ error: 'Kimlik Bilgileri Nüfus Müdürlüğü ile Uyuşmadı' }, { status: 400 });
      }

      // 6 Haneli Rastgele SMS OTP Oluştur
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

      // temp_otps tablosuna kaydet
      await query(
        `INSERT INTO public.temp_otps (phone, tc, otp, expires_at, used) 
         VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes', false)`,
        [telefon.trim(), tc.trim(), generatedOtp]
      );

      // OTP'yi gerçek SMS ile gönder
      const smsSent = await sendOtpSms(telefon.trim(), generatedOtp);

      // OTP değeri ASLA üretimde yanıtta dönmez (aksi halde SMS doğrulaması anlamsız olur).
      // Yalnızca üretim dışı ortamda, geliştirme kolaylığı için ekrana simüle edilir.
      const includeOtpInResponse = ALLOW_TEST_IDENTITY;

      if (!smsSent && !includeOtpInResponse) {
        return NextResponse.json(
          { error: 'Doğrulama SMS kodu gönderilemedi. Lütfen daha sonra tekrar deneyin.' },
          { status: 502 }
        );
      }

      if (includeOtpInResponse) {
        console.log(`[SMS OTP - Üretim Dışı] TC: ${tc}, Tel: ${telefon}, OTP: ${generatedOtp}`);
      }

      return NextResponse.json({
        success: true,
        message: smsSent
          ? 'Kimlik doğrulama başarılı. Doğrulama kodu telefonunuza SMS ile gönderildi.'
          : 'Kimlik doğrulama başarılı. (Geliştirme modu: OTP ekranda gösteriliyor.)',
        ...(includeOtpInResponse ? { otp: generatedOtp } : {}),
      });
    }

    // 2. ADIM: OTP Doğrulama ve Kaydetme
    if (action === 'verify-and-save') {
      const { otp, type, tc, ad, soyad, dogum_yili, telefon, adres, bina_tipi, isyeri_adi_turu } = body;
      if (!otp || !type || !tc || !ad || !soyad || !dogum_yili || !telefon || !adres || !bina_tipi) {
        return NextResponse.json({ error: 'Gerekli başvuru ve OTP bilgileri eksik.' }, { status: 400 });
      }

      // Mükerrer Kayıt Kontrolü (Son 5 Dakika)
      let talepTuruVal = 'Baca Temizliği';
      if (type === 'yangin_olur_raporu') talepTuruVal = 'İtfaiye Uygunluk Raporu';
      else if (type === 'egitim_talebi') talepTuruVal = 'Eğitim Talebi';
      else if (type === 'yangin_raporu') talepTuruVal = 'Yangın Raporu';

      const duplicateCheck = await query(
        `SELECT * FROM public.service_applications 
         WHERE basvuran_tc = $1 AND talep_turu = $2 AND created_at > NOW() - INTERVAL '5 minutes'`,
        [tc.trim(), talepTuruVal]
      );
      if (duplicateCheck.rows.length > 0) {
        return NextResponse.json({ error: 'Son 5 dakika içinde bu hizmet türü için zaten aktif bir başvurunuz bulunmaktadır. Lütfen daha sonra tekrar deneyiniz.' }, { status: 400 });
      }

      // OTP Doğruluğunu ve geçerliliğini kontrol et
      const otpCheck = await query(
        `SELECT * FROM public.temp_otps 
         WHERE phone = $1 AND tc = $2 AND otp = $3 AND used = false AND expires_at > NOW() 
         ORDER BY id DESC LIMIT 1`,
        [telefon.trim(), tc.trim(), otp.trim()]
      );

      if (otpCheck.rows.length === 0) {
        return NextResponse.json({ error: 'SMS OTP doğrulama kodu hatalı veya süresi geçmiş. Lütfen yeni bir kod isteyin.' }, { status: 400 });
      }

      const otpRow = otpCheck.rows[0];

      // OTP'yi kullanıldı olarak işaretle
      await query('UPDATE public.temp_otps SET used = true WHERE id = $1', [otpRow.id]);

      // Takip kodu üret
      let trackingCode = '';
      if (type === 'yangin_olur_raporu') {
        const pattern = `SVS-YANGIN-${year}-%`;
        const countRes = await queryOne<{ count: string }>(
          'SELECT COUNT(*) as count FROM public.yangin_rapor_basvurulari WHERE takip_kodu LIKE $1',
          [pattern]
        );
        const count = countRes ? parseInt(countRes.count, 10) : 0;
        trackingCode = `SVS-YANGIN-${year}-${String(count + 1).padStart(3, '0')}`;

        // 1. Eski yangın_rapor_basvurulari tablosuna ekle
        await query(
          `INSERT INTO public.yangin_rapor_basvurulari (takip_kodu, ad_soyad, telefon, adres, bina_tipi, isyeri_adi_turu)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [trackingCode, `${ad.trim()} ${soyad.trim()}`, telefon.trim(), adres.trim(), bina_tipi.trim(), isyeri_adi_turu?.trim() || '']
        );
      } else if (type === 'egitim_talebi') {
        const pattern = `SVS-EGITIM-${year}-%`;
        const countRes = await queryOne<{ count: string }>(
          'SELECT COUNT(*) as count FROM public.service_applications WHERE takip_kodu LIKE $1',
          [pattern]
        );
        const count = countRes ? parseInt(countRes.count, 10) : 0;
        trackingCode = `SVS-EGITIM-${year}-${String(count + 1).padStart(3, '0')}`;
      } else if (type === 'yangin_raporu') {
        const pattern = `SVS-YRAPOR-${year}-%`;
        const countRes = await queryOne<{ count: string }>(
          'SELECT COUNT(*) as count FROM public.service_applications WHERE takip_kodu LIKE $1',
          [pattern]
        );
        const count = countRes ? parseInt(countRes.count, 10) : 0;
        trackingCode = `SVS-YRAPOR-${year}-${String(count + 1).padStart(3, '0')}`;
      } else {
        const pattern = `SVS-BACA-${year}-%`;
        const countRes = await queryOne<{ count: string }>(
          'SELECT COUNT(*) as count FROM public.baca_temizlik_basvurulari WHERE takip_kodu LIKE $1',
          [pattern]
        );
        const count = countRes ? parseInt(countRes.count, 10) : 0;
        trackingCode = `SVS-BACA-${year}-${String(count + 1).padStart(3, '0')}`;

        // 1. Eski baca_temizlik_basvurulari tablosuna ekle
        await query(
          `INSERT INTO public.baca_temizlik_basvurulari (takip_kodu, ad_soyad, telefon, adres, bina_tipi)
           VALUES ($1, $2, $3, $4, $5)`,
          [trackingCode, `${ad.trim()} ${soyad.trim()}`, telefon.trim(), adres.trim(), bina_tipi.trim()]
        );
      }

      // 2. Yeni service_applications tablosuna ekle
      talepTuruVal = 'Baca Temizliği';
      if (type === 'yangin_olur_raporu') talepTuruVal = 'İtfaiye Uygunluk Raporu';
      else if (type === 'egitim_talebi') talepTuruVal = 'Eğitim Talebi';
      else if (type === 'yangin_raporu') talepTuruVal = 'Yangın Raporu';

      const serviceRes = await query(
        `INSERT INTO public.service_applications (
          takip_kodu, talep_turu, basvuran_tc, basvuran_ad, basvuran_soyad, basvuran_dogum_yili, irtibat_tel, adres, bina_tipi, isyeri_adi_turu, durum
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'BEKLEMEDE') RETURNING *`,
        [
          trackingCode,
          talepTuruVal,
          tc.trim(),
          ad.trim(),
          soyad.trim(),
          parseInt(dogum_yili, 10),
          telefon.trim(),
          adres.trim(),
          bina_tipi.trim(),
          isyeri_adi_turu?.trim() || null
        ]
      );

      // 3. citizen_requests tablosuna da kaydet
      try {
        let detaylar: any = {};
        if (type === 'yangin_olur_raporu') {
          detaylar = { faaliyet_konusu: isyeri_adi_turu?.trim() || '', alan_m2: 100, yangin_dolabi: 'Mevcut', acil_cikis: '1 Adet', bina_tipi: bina_tipi.trim() };
        } else if (type === 'egitim_talebi') {
          detaylar = { egitim_tarihi: new Date().toISOString().split('T')[0], kisi_sayisi: Number(body.kisi_sayisi) || 30, egitim_turu: isyeri_adi_turu?.trim() || 'Yangın Önleme ve Temel Yangın Eğitimi' };
        } else if (type === 'yangin_raporu') {
          detaylar = { yangin_nedeni: isyeri_adi_turu?.trim() || 'Yangın Raporu Talebi', bina_tipi: bina_tipi.trim() };
        } else {
          detaylar = { kat_sayisi: 1, daire_sayisi: 1, yakit_tipi: 'Doğalgaz', baca_tipi: bina_tipi.trim() };
        }

        const detailsField = (type === 'yangin_olur_raporu' || type === 'egitim_talebi' || type === 'yangin_raporu') ? 'isyeri_detaylari' : 'baca_detaylari';

        await query(
          `INSERT INTO public.citizen_requests (talep_turu, basvuru_tarihi, basvuran_tc, basvuran_ad_soyad, irtibat_tel, adres, durum, ${detailsField})
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            talepTuruVal,
            new Date().toISOString(),
            trackingCode,
            `${ad.trim()} ${soyad.trim()}`,
            telefon.trim(),
            adres.trim(),
            'Bekliyor',
            JSON.stringify(detaylar)
          ]
        );
      } catch (err) {
        console.error('[citizen-requests] citizen_requests tablosuna yedekleme başarısız:', err);
      }

      let successMsg = 'Baca temizliği başvurunuz başarıyla alınmıştır.';
      if (type === 'yangin_olur_raporu') successMsg = 'İtfaiye olur raporu başvurunuz başarıyla alınmıştır.';
      else if (type === 'egitim_talebi') successMsg = 'Eğitim talebi başvurunuz başarıyla alınmıştır.';
      else if (type === 'yangin_raporu') successMsg = 'Yangın raporu başvurunuz başarıyla alınmıştır.';

      return NextResponse.json({
        success: true,
        message: successMsg,
        trackingCode,
        data: serviceRes.rows[0]
      });
    }

    // Geriye dönük uyumluluk: action yoksa eski düz POST desteği (veya SMS OTP zorunluluğu uyarısı)
    if (body.type === 'yangin_olur_raporu') {
      return NextResponse.json({ error: 'Ruhsat uygunluk başvuruları için SMS OTP ve NVİ doğrulaması zorunludur.' }, { status: 400 });
    }

    // Baca temizliği için OTP'siz doğrudan kayıt desteği devam edebilir:
    if (body.type === 'baca_temizligi') {
      const { ad_soyad, telefon, adres, bina_tipi } = body;
      if (!ad_soyad || !telefon || !adres || !bina_tipi) {
        return NextResponse.json({ error: 'Tüm alanların doldurulması zorunludur.' }, { status: 400 });
      }

      const pattern = `SVS-BACA-${year}-%`;
      const countRes = await queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM public.baca_temizlik_basvurulari WHERE takip_kodu LIKE $1',
        [pattern]
      );
      const count = countRes ? parseInt(countRes.count, 10) : 0;
      const trackingCode = `SVS-BACA-${year}-${String(count + 1).padStart(3, '0')}`;

      const insertRes = await query(
        `INSERT INTO public.baca_temizlik_basvurulari (takip_kodu, ad_soyad, telefon, adres, bina_tipi)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [trackingCode, ad_soyad.trim(), telefon.trim(), adres.trim(), bina_tipi.trim()]
      );

      // Yeni tablolara da eşle
      const [nameAd, ...nameSoyadArr] = ad_soyad.trim().split(' ');
      const nameSoyad = nameSoyadArr.join(' ') || 'Bilinmiyor';

      await query(
        `INSERT INTO public.service_applications (
          takip_kodu, talep_turu, basvuran_tc, basvuran_ad, basvuran_soyad, basvuran_dogum_yili, irtibat_tel, adres, bina_tipi, durum
        ) VALUES ($1, 'Baca Temizliği', '00000000000', $2, $3, 1990, $4, $5, $6, 'BEKLEMEDE')`,
        [trackingCode, nameAd, nameSoyad, telefon.trim(), adres.trim(), bina_tipi.trim()]
      );

      try {
        await query(
          `INSERT INTO public.citizen_requests (talep_turu, basvuru_tarihi, basvuran_tc, basvuran_ad_soyad, irtibat_tel, adres, durum, baca_detaylari)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            'Baca Temizliği',
            new Date().toISOString(),
            trackingCode,
            ad_soyad.trim(),
            telefon.trim(),
            adres.trim(),
            'Bekliyor',
            JSON.stringify({ kat_sayisi: 1, daire_sayisi: 1, yakit_tipi: 'Doğalgaz', baca_tipi: bina_tipi.trim() })
          ]
        );
      } catch (err) {
        console.error('[citizen-requests] citizen_requests tablosuna yedekleme başarısız:', err);
      }

      return NextResponse.json({
        success: true,
        message: 'Baca temizliği başvurunuz başarıyla alınmıştır.',
        trackingCode,
        data: insertRes.rows[0],
      });
    }

    return NextResponse.json({ error: 'Geçersiz istek türü.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[citizen-requests/POST] Hata:', msg);
    return NextResponse.json(
      { error: 'Sunucu hatası oluştu: ' + msg },
      { status: 500 }
    );
  }
}
