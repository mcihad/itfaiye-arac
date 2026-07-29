/**
 * Olay/vaka sevkinde ilgili personele gönderilen bildirimler (Web Push + WhatsApp).
 * (Eskiden route.ts içindeydi; okunabilirlik için ayrıldı.)
 */
import { query } from '@/lib/db';
import webpush from 'web-push';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

// Push kimlik bilgileri deployment sırrıdır. Henüz yapılandırılmadıysa API'nin geri
// kalanının başlamasını engelleme.
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:sivas-itfaiye@sivas.bel.tr',
    vapidPublicKey,
    vapidPrivateKey
  );
}

export async function sendIncidentPushNotifications(incidentId: string, assignedSicilNos: string[]) {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('[WebPush] VAPID credentials are not configured; notification skipped.');
      return;
    }

    const locRes = await query(`
      SELECT ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat, olay_turu, mahalle, adres
      FROM public.incidents
      WHERE id = $1
    `, [incidentId]);

    let lat = 39.750;
    let lng = 37.016;
    let olayTuru = 'Yangın';
    let mahalle = 'Bilinmeyen Mahalle';
    let adres = '';

    if (locRes.rows[0]) {
      const row = locRes.rows[0];
      lng = row.lng !== null && row.lng !== undefined ? parseFloat(row.lng) : 37.016;
      lat = row.lat !== null && row.lat !== undefined ? parseFloat(row.lat) : 39.750;
      olayTuru = row.olay_turu || 'Yangın';
      mahalle = row.mahalle || 'Bilinmeyen Mahalle';
      adres = row.adres || '';
    }

    const title = `🚨 CANLI İHBAR: ${olayTuru}`;
    const body = `Yeni Sevk: ${mahalle} Mah. ${adres ? `- ${adres}` : ''}`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

    const personnelQuery = `
      SELECT sicil_no, push_subscription_token
      FROM public.personnel
      WHERE (sicil_no = ANY($1)
         OR rol IN ('Amir', 'Müdür')
         OR unvan ILIKE '%amir%'
         OR unvan ILIKE '%müdür%'
         OR unvan ILIKE '%çavuş%')
        AND push_subscription_token IS NOT NULL
    `;
    const tokenRes = await query(personnelQuery, [assignedSicilNos]);

    for (const pRow of tokenRes.rows) {
      if (!pRow.push_subscription_token) continue;
      try {
        const subscription = JSON.parse(pRow.push_subscription_token);
        const payload = JSON.stringify({
          title,
          body,
          url: mapsUrl,
          // Saha Modu alarm katmanı için: "Yola Çıktım" kaydının olaya
          // bağlanabilmesi olay kimliğine ihtiyaç duyar (service worker
          // payload'ı olduğu gibi iletir).
          incidentId,
          olay_turu: olayTuru,
          mahalle,
          adres
        });
        await webpush.sendNotification(subscription, payload);
      } catch (err) {
        console.error(`[WebPush] Gönderim hatası (Sicil: ${pRow.sicil_no}):`, err);
      }
    }
  } catch (err) {
    console.error('sendIncidentPushNotifications hatası:', err);
  }
}

export async function sendIncidentWhatsAppNotification(incidentId: string, assignedSicilNos: string[]) {
  try {
    const locRes = await query(`
      SELECT ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat, olay_turu, mahalle, adres
      FROM public.incidents
      WHERE id = $1
    `, [incidentId]);

    let lat = 39.750;
    let lng = 37.016;
    let olayTuru = 'Yangın';
    let mahalle = 'Bilinmeyen Mahalle';
    let adres = '';

    if (locRes.rows[0]) {
      const row = locRes.rows[0];
      lng = row.lng !== null && row.lng !== undefined ? parseFloat(row.lng) : 37.016;
      lat = row.lat !== null && row.lat !== undefined ? parseFloat(row.lat) : 39.750;
      olayTuru = row.olay_turu || 'Yangın';
      mahalle = row.mahalle || 'Bilinmeyen Mahalle';
      adres = row.adres || '';
    }

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    const text = `🚨 DİKKAT: ${olayTuru}, ${mahalle} bölgesinde ihbar. Aracınızla ivedi çıkış yapın! Rota Linki: ${mapsUrl}`;

    const phoneRes = await query(`
      SELECT pd.telefon, p.sicil_no
      FROM public.personnel p
      JOIN public.personnel_details pd ON p.sicil_no = pd.sicil_no
      WHERE (p.sicil_no = ANY($1)
         OR p.rol IN ('Amir', 'Müdür')
         OR p.unvan ILIKE '%amir%'
         OR p.unvan ILIKE '%müdür%'
         OR p.unvan ILIKE '%çavuş%')
        AND pd.telefon IS NOT NULL AND pd.telefon != ''
    `, [assignedSicilNos]);

    for (const row of phoneRes.rows) {
      try {
        console.log(`[WhatsApp Gateway] Mesaj gönderiliyor -> Tel: ${row.telefon}, Mesaj: ${text}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        fetch('http://localhost:3001/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: row.telefon,
            message: text
          }),
          signal: controller.signal
        }).then(() => {
          clearTimeout(timeoutId);
        }).catch(() => {
          clearTimeout(timeoutId);
        });
      } catch (err) {
        console.error(`[WhatsApp Gateway] Hata (Sicil: ${row.sicil_no}):`, err);
      }
    }
  } catch (err) {
    console.error('sendIncidentWhatsAppNotification hatası:', err);
  }
}
