import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * POST /api/ai/route-analysis
 * 
 * Sivas İtfaiyesi AI Rota Analizi Endpoint'i
 * Google Gemini ile olay yerine en güvenli/hızlı rotayı ve riskleri analiz eder.
 * 
 * Body: {
 *   incidentLocation: string,   // Yangın adresi veya koordinatı
 *   stationLocation: string,    // İtfaiye çıkış noktası
 *   roadClosures: string[],     // Kapalı yollar dizisi
 *   weather: string             // Rüzgar/hava durumu
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // ─── 1. API Key Kontrolü ────────────────────────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY ortam değişkeni tanımlanmamış. Lütfen .env.local dosyasına ekleyin.' },
        { status: 500 }
      );
    }

    // ─── 2. Request Body Doğrulama ──────────────────────────
    const body = await request.json();
    const { incidentLocation, stationLocation, roadClosures, weather } = body;

    if (!incidentLocation || !stationLocation) {
      return NextResponse.json(
        { error: 'incidentLocation ve stationLocation zorunlu alanlardır.' },
        { status: 400 }
      );
    }

    // ─── 3. Gemini Model Başlatma ───────────────────────────
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // ─── 4. Taktiksel Prompt Oluşturma ──────────────────────
    const systemPrompt = `Sen Sivas İtfaiyesi Komuta Kontrol Merkezindeki uzman bir taktiksel yapay zekasın.
Sana itfaiye çıkış noktası, olay yeri, güzergahtaki kapalı yollar ve rüzgar durumu verilecek.
Ekipler için en güvenli, en hızlı alternatif rotayı ve olay yerindeki riskleri 3 kısa, net, operasyonel dille yazılmış madde halinde özetle.

Her zaman Türkçe ve net operasyonel dille yanıt ver. Gereksiz açıklamalardan kaçın.
Maddeleri numaralı liste olarak yaz (1. 2. 3.).`;

    const userPrompt = `
📍 İtfaiye Çıkış Noktası: ${stationLocation}
🔥 Olay Yeri: ${incidentLocation}
🚧 Kapalı / Engelli Yollar: ${roadClosures && roadClosures.length > 0 ? roadClosures.join(', ') : 'Bildirilmemiş'}
🌬️ Hava / Rüzgar Durumu: ${weather || 'Bilgi yok'}

Lütfen rotayı ve riskleri analiz et.`;

    // ─── 5. Gemini'ye İstek Gönder ──────────────────────────
    const result = await model.generateContent([systemPrompt, userPrompt]);
    const response = result.response;
    const responseText = response.text();

    if (!responseText) {
      return NextResponse.json(
        { error: 'Gemini modeli boş bir yanıt döndü. Lütfen tekrar deneyin.' },
        { status: 502 }
      );
    }

    // ─── 6. Başarılı Yanıt ──────────────────────────────────
    return NextResponse.json({
      analysis: responseText,
      model: 'gemini-2.5-flash',
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[AI Route Analysis] Hata:', error);

    // Gemini-specific error handling
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'Geçersiz Gemini API anahtarı. Lütfen .env.local dosyasındaki GEMINI_API_KEY değerini kontrol edin.' },
        { status: 401 }
      );
    }

    if (error.message?.includes('quota') || error.message?.includes('rate')) {
      return NextResponse.json(
        { error: 'Gemini API kota sınırına ulaşıldı. Lütfen birkaç dakika bekleyip tekrar deneyin.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: `Yapay zeka analizi sırasında bir hata oluştu: ${error.message || 'Bilinmeyen hata'}` },
      { status: 500 }
    );
  }
}
