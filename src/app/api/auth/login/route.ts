import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyPassword, signToken, COOKIE_CONFIG } from '@/lib/auth';

/**
 * POST /api/auth/login
 * Body: { sicil_no: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
    console.log("1. API İsteği Geldi - POST /api/auth/login");
    const body = await request.json();
    const { sicil_no, password } = body;

    if (!sicil_no || !password) {
      return NextResponse.json(
        { error: 'Sicil numarası ve parola zorunludur.' },
        { status: 400 }
      );
    }

    const key = sicil_no.toUpperCase().trim();

    // Personeli bul
    console.log(`2. DB Bağlantısı Deneniyor - Sicil: ${key}`);
    const person = await queryOne(
      'SELECT * FROM personnel WHERE sicil_no = $1',
      [key]
    );
    console.log(`3. Sorgu Bitti - Sonuç: ${person ? 'Kullanıcı Bulundu' : 'Bulunamadı'}`);

    if (!person) {
      // Auth log — başarısız
      await query(
        'INSERT INTO auth_logs (sicil_no, event_type, details) VALUES ($1, $2, $3)',
        [key, 'login_failed', 'Sicil numarası bulunamadı']
      );
      return NextResponse.json(
        { error: 'Sicil numarası veya parola hatalı.' },
        { status: 401 }
      );
    }

    if (!person.aktif) {
      await query(
        'INSERT INTO auth_logs (sicil_no, event_type, details) VALUES ($1, $2, $3)',
        [key, 'login_failed', 'Hesap pasif durumda']
      );
      return NextResponse.json(
        { error: 'Hesabınız pasif durumdadır.' },
        { status: 401 }
      );
    }

    // Şifre kontrolü
    if (!person.password_hash) {
      // Eğer hash yoksa, varsayılan şifre "1234" ile dene (ilk kurulum için)
      if (password !== '1234') {
        return NextResponse.json(
          { error: 'Sicil numarası veya parola hatalı.' },
          { status: 401 }
        );
      }
    } else {
      const valid = await verifyPassword(password, person.password_hash);
      if (!valid) {
        await query(
          'INSERT INTO auth_logs (sicil_no, event_type, details) VALUES ($1, $2, $3)',
          [key, 'login_failed', 'Hatalı parola']
        );
        return NextResponse.json(
          { error: 'Sicil numarası veya parola hatalı.' },
          { status: 401 }
        );
      }
    }

    // JWT token üret
    const token = signToken({
      sicilNo: person.sicil_no,
      ad: person.ad,
      soyad: person.soyad,
      rol: person.rol,
      unvan: person.unvan,
    });

    // Auth log — başarılı
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    await query(
      'INSERT INTO auth_logs (sicil_no, event_type, ip_address, user_agent, details) VALUES ($1, $2, $3, $4, $5)',
      [key, 'login_success', ip, ua, `${person.ad} ${person.soyad} (${person.unvan})`]
    );

    // Cookie set et (ve JSON olarak da dön ki fallback mekanizması çalışabilsin)
    const response = NextResponse.json({
      success: true,
      token: token,
      user: {
        sicilNo: person.sicil_no,
        ad: person.ad,
        soyad: person.soyad,
        unvan: person.unvan,
        rol: person.rol,
        posta: person.posta || '',
      }
    });

    response.cookies.set(COOKIE_CONFIG.name, token, {
      httpOnly: COOKIE_CONFIG.httpOnly,
      secure: COOKIE_CONFIG.secure,
      sameSite: COOKIE_CONFIG.sameSite,
      path: COOKIE_CONFIG.path,
      maxAge: COOKIE_CONFIG.maxAge,
    });

    return response;
  } catch (error: any) {
    console.error('[auth/login] Sunucu hatası:', error);
    return NextResponse.json(
      { error: 'Sunucu hatası: ' + error.message },
      { status: 500 }
    );
  }
}
