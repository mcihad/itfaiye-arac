import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { mapUserToPermissionRole, getDefaultPagePermission } from '@/lib/permissions';
import { ensureTableSchema } from '@/app/api/db/[table]/schema';

/**
 * GET /api/auth/page-permission?sayfa_id=<id>
 *
 * Oturumdaki kullanıcının verilen sayfayı görüntüleme yetkisini role_permissions
 * tablosundan hesaplar. proxy.ts (middleware) tarafından çağrılır — edge runtime
 * DB'ye erişemediği için sayfa yetki zorlaması bu uç üzerinden yapılır.
 * Rol istemciden ALINMAZ; her zaman doğrulanmış JWT oturumundan türetilir.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ allowed: false, error: 'Oturum bulunamadı.' }, { status: 401 });
    }

    const sayfaId = request.nextUrl.searchParams.get('sayfa_id') || '';
    if (!sayfaId || !/^[a-z_]{1,40}$/.test(sayfaId)) {
      return NextResponse.json({ allowed: false, error: 'Geçersiz sayfa_id.' }, { status: 400 });
    }

    const mappedRole = mapUserToPermissionRole(session);

    await ensureTableSchema('role_permissions');
    const res = await query(
      'SELECT izinli FROM role_permissions WHERE rol = $1 AND sayfa_id = $2 LIMIT 1',
      [mappedRole, sayfaId]
    );

    const allowed = res.rows.length > 0
      ? !!res.rows[0].izinli
      : getDefaultPagePermission(mappedRole, sayfaId);

    return NextResponse.json({ allowed, rol: mappedRole });
  } catch (err) {
    console.error('[page-permission] Hata:', err);
    // DB'ye ulaşılamazsa deterministik varsayılan matrise düşülür (fail-open değil).
    const session = getSessionFromRequest(request);
    const mappedRole = mapUserToPermissionRole(session);
    const sayfaId = request.nextUrl.searchParams.get('sayfa_id') || '';
    return NextResponse.json({ allowed: getDefaultPagePermission(mappedRole, sayfaId), rol: mappedRole });
  }
}
