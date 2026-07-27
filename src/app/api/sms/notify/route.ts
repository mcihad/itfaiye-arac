import { NextRequest, NextResponse } from "next/server";
import { query as dbQuery } from "@/lib/db";
import { getActivePostaForStation } from "@/lib/shiftUtils";
import { getSessionFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // Toplu SMS tetikleme yetkisi: yöneticiler ve olay kaydı açan santral/ihbar
    // personeli. En düşük yetkili oturumların (Er/Şoför) kurumun SMS hattından
    // serbest metin toplu mesaj göndermesi engellenir.
    const rol = session.rol || '';
    const unvan = (session.unvan || '').toLowerCase();
    const canSendSms =
      ['Admin', 'Editor', 'Shift_Leader', 'Santral'].includes(rol) ||
      /müdür|amir|çavuş|cavus|santral|ihbar|memur/.test(unvan);
    if (!canSendSms) {
      return NextResponse.json({ success: false, error: "SMS bildirimi göndermek için yetkiniz yok." }, { status: 403 });
    }

    const action = body.action || 'incident'; // 'incident', 'training', 'inventory'

    if (!process.env.SMS_API_KEY || !process.env.SMS_API_SECRET) {
      console.warn("SMS_API_KEY or SMS_API_SECRET is not configured. Skipping SMS notification.");
      return NextResponse.json({ success: false, error: "SMS API keys missing" }, { status: 500 });
    }

    {
      let query = "";
      let queryParams: any[] = [];
      let smsContent = "";

      if (action === 'incident') {
        const { missionTitle, missionAddress, missionType, detail } = body;
        const activePosta = getActivePostaForStation('Merkez', new Date());
        query = `
          SELECT p.ad, p.soyad, COALESCE(p.telefon, pd.telefon) as phone
          FROM public.personnel p
          LEFT JOIN public.personnel_details pd ON p.sicil_no = pd.sicil_no
          WHERE (
            p.posta_no = $1
            OR p.posta_no IS NULL
            OR p.posta_no = 0
            OR p.unvan IN ('Müdür', 'Amir', 'Baş Şoför', 'Eğitim Çavuşu')
          )
            AND COALESCE(p.telefon, pd.telefon) IS NOT NULL
            AND COALESCE(p.telefon, pd.telefon) != ''
            AND p.aktif = true
            AND COALESCE(p.durum, '') NOT ILIKE '%izin%'
            AND COALESCE(p.durum, '') NOT ILIKE '%rapor%'
        `;
        queryParams = [activePosta];
        smsContent = `[YENİ OLAY - ${missionType}]\nKonu: ${missionTitle}\nAdres: ${missionAddress}\nDetay: ${detail || '-'}\nLütfen olay yerine intikal ediniz.`;
      } 
      else if (action === 'training') {
        const { date, topic, personnelIds } = body;
        const activePosta = getActivePostaForStation('Merkez', new Date(date));
        query = `
          SELECT p.ad, p.soyad, COALESCE(p.telefon, pd.telefon) as phone
          FROM public.personnel p
          LEFT JOIN public.personnel_details pd ON p.sicil_no = pd.sicil_no
          WHERE (
            p.posta_no = $1 
            OR p.posta_no IS NULL 
            OR p.posta_no = 0 
            OR p.unvan IN ('Müdür', 'Amir', 'Baş Şoför', 'Eğitim Çavuşu')
            OR p.id::text = ANY($2::text[])
            OR p.sicil_no = ANY($2::text[])
          )
            AND COALESCE(p.telefon, pd.telefon) IS NOT NULL
            AND COALESCE(p.telefon, pd.telefon) != ''
            AND p.aktif = true
            AND COALESCE(p.durum, '') NOT ILIKE '%izin%'
            AND COALESCE(p.durum, '') NOT ILIKE '%rapor%'
        `;
        queryParams = [activePosta, personnelIds || []];
        smsContent = `[EĞİTİM PLANLAMASI]\nTarih: ${date}\nKonu: ${topic}\nİlgili posta ve idari kadroya duyurulur. Lütfen katılım sağlayınız.`;
      } 
      // Not: 'inventory' (sayım yapıldı) SMS'i kaldırıldı. Sayım yapılmadığında
      // uyarı /api/cron/sayim-uyari üzerinden gönderilir.
      else {
        return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
      }

      const { rows } = await dbQuery(query, queryParams);

      if (rows.length === 0) {
        return NextResponse.json({ success: true, message: "No personnel to notify" });
      }

      const phoneNumbers = rows
        .map(r => r.phone.replace(/\s+/g, ''))
        .filter(p => p.length >= 10);

      if (phoneNumbers.length === 0) {
        return NextResponse.json({ success: true, message: "No valid phone numbers found" });
      }

      const smsResponse = await fetch('https://bildirim.sivas.bel.tr/api/v1/sms-send-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.SMS_API_KEY,
          'X-Api-Secret': process.env.SMS_API_SECRET
        },
        body: JSON.stringify({
          phoneNumbers,
          content: smsContent
        })
      });

      if (!smsResponse.ok) {
        const errorText = await smsResponse.text();
        throw new Error(`SMS API error: ${smsResponse.status} ${errorText}`);
      }

      const result = await smsResponse.json();
      return NextResponse.json({ success: true, recipients: phoneNumbers.length, apiResponse: result });
    }

  } catch (error: any) {
    console.error(`Failed to send SMS notification:`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
