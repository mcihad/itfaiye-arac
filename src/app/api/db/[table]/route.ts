import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionFromRequest, hashPassword, isAdminSession, isManagerSession, type JWTPayload } from '@/lib/auth';
import { ensureTableSchema, autoSeedVehiclesIfEmpty } from './schema';
import { sendIncidentPushNotifications, sendIncidentWhatsAppNotification } from './notifications';

const JSON_COLUMNS = [
  'details', 'baca_detaylari', 'isyeri_detaylari', 
  'kurtarma_sayisi', 'yangin_sayisi', 'fotograflar', 
  'bildirilen_kurumlar', 'hedef_araclar', 'sorular', 
  'checklist', 'bolmeler'
];

// Turkish character mapping and username helpers
function removeTurkishChars(str: string): string {
  const map: Record<string, string> = {
    İ: "i", ı: "i", Ö: "o", ö: "o", Ü: "u", ü: "u",
    Ş: "s", ş: "s", Ç: "c", ç: "c", Ğ: "g", ğ: "g",
  };
  return str.replace(/[İıÖöÜüŞşÇçĞğ]/g, (ch) => map[ch] || ch);
}

function generateUsername(ad: string, soyad: string): string {
  const firstLetter = removeTurkishChars(ad.charAt(0)).toLowerCase();
  const surname = removeTurkishChars(soyad).toLowerCase();
  return firstLetter + surname;
}


// İzin verilen tablolar (SQL injection koruması)
const ALLOWED_TABLES = [
  'vehicles', 'personnel', 'maintenance_logs', 'fuel_logs', 'tasks',
  'task_templates', 'scba_cylinders', 'scba_fill_logs', 'incident_reports',
  'auth_logs', 'audit_logs', 'inventory_checks', 'personnel_details',
  'personnel_leaves', 'personnel_records', 'personnel_equipment',
  'incidents', 'incident_vehicles', 'incident_personnel', 'incident_media',
  'citizen_requests', 'activities_and_trainings', 'personnel_activities',
  'vehicle_maintenances', 'fire_hydrants', 'spatial_addresses',
  'staff_certifications', 'vw_expiring_certifications', 'unified_system_logs', 'daily_vehicle_checks',
  'role_permissions', 'duty_logs', 'arac_bakim_gecmisi',
  'baca_temizlik_basvurulari', 'yangin_rapor_basvurulari', 'inventory', 'vehicle_inventory',
  'personnel_shifts_log', 'service_applications', 'hourly_shifts',
  'temporary_assignments', 'daily_summary_reports', 'blacklist_institutions', 'external_educations', 'external_missions', 'radio_logs', 'egitim_mufredati', 'system_settings',
  'radio_recordings'
];

// ─── Yazma (POST/PATCH/DELETE) Yetkilendirme Politikası ──────────────────────
// Amaç: JWT'si olan herhangi bir kullanıcının (ör. "Er") hassas tablolara serbestçe
// yazarak yetki yükseltmesini engellemek.

// Yalnızca Admin/Müdür seviyesinin yazabileceği tablolar (rol/izin yönetimi, sistem
// ayarları, parola kayıtları, kara liste).
const ADMIN_WRITE_TABLES = new Set<string>([
  'role_permissions', 'system_settings', 'temp_passwords',
]);

// Yönetici (Admin/Editor/Shift_Leader veya Müdür/Amir/Çavuş/Başçavuş) seviyesinin
// yazabileceği tablolar (KVKK kapsamındaki personel verileri ve kara liste yönetimi).
const MANAGER_WRITE_TABLES = new Set<string>([
  'personnel_details', 'personnel_leaves', 'personnel_records', 'personnel_equipment',
  'staff_certifications', 'blacklist_institutions',
]);

// Denetim izleri: istemci bu tablolara generic endpoint üzerinden hiç yazamaz.
// (Uygulama bu tablolara sunucu tarafında query() ile doğrudan yazar; forge edilmiş
// denetim kaydı enjeksiyonunu önlemek için istemci yazımı tamamen kapalıdır.)
const SERVER_ONLY_WRITE_TABLES = new Set<string>([
  'audit_logs', 'auth_logs',
]);

// personnel tablosunda yalnızca yöneticilerin değiştirebileceği hassas kolonlar
// (rol/unvan/izin bayrakları/parola/aktiflik/kimlik alanları).
const PERSONNEL_SENSITIVE_COLUMNS = new Set<string>([
  'rol', 'unvan', 'view_only', 'can_approve', 'can_print',
  'password_hash', 'password', 'aktif', 'sicil_no', 'username', 'id',
]);

// ─── Okuma (GET) Yetkilendirme Politikası ────────────────────────────────────
// Yazma politikasının okuma karşılığı: oturumu olan herkesin hassas tabloları
// çekebilmesini engeller.

// Yalnızca Admin/Müdür seviyesinin okuyabileceği tablolar (kimlik doğrulama ve
// denetim izleri).
const ADMIN_READ_TABLES = new Set<string>([
  'auth_logs', 'audit_logs',
]);

// Yönetici (Admin/Editor/Shift_Leader veya Müdür/Amir/Çavuş/Başçavuş) seviyesinin
// okuyabileceği tablolar (KVKK kapsamındaki özlük verileri).
const MANAGER_READ_TABLES = new Set<string>([
  'personnel_details', 'personnel_records',
]);

// Yanıtlardan her koşulda ayıklanan kolonlar (SELECT *, RETURNING * dahil).
const RESPONSE_STRIPPED_COLUMNS: Record<string, string[]> = {
  personnel: ['password_hash'],
};

function authorizeRead(session: JWTPayload, table: string): { error: string; status: number } | null {
  if (ADMIN_READ_TABLES.has(table) && !isAdminSession(session)) {
    return { error: 'Bu tabloyu okumak için yönetici (Müdür/Admin) yetkisi gereklidir.', status: 403 };
  }
  if (MANAGER_READ_TABLES.has(table) && !isManagerSession(session)) {
    return { error: 'Bu tabloyu okumak için yönetici yetkisi gereklidir.', status: 403 };
  }
  return null;
}

// Hassas kolonları yanıt satırlarından siler (rows dizisini yerinde değiştirir).
function stripSensitiveColumns(table: string, rows: any[]): any[] {
  const cols = RESPONSE_STRIPPED_COLUMNS[table];
  if (!cols || !Array.isArray(rows)) return rows;
  for (const row of rows) {
    if (row && typeof row === 'object') {
      for (const col of cols) delete row[col];
    }
  }
  return rows;
}

/**
 * Bir yazma isteğinin yetkili olup olmadığını denetler.
 * Yetkisizse { error, status } döner; yetkiliyse null.
 *
 * @param rows    POST için satır nesneleri dizisi, PATCH için [data]; kolon adları buradan okunur
 * @param filters PATCH/DELETE hedef filtreleri (personnel self-update kontrolü için)
 */
function authorizeWrite(
  session: JWTPayload,
  table: string,
  rows: Array<Record<string, unknown>>,
  filters?: Record<string, unknown>
): { error: string; status: number } | null {
  if (SERVER_ONLY_WRITE_TABLES.has(table)) {
    return { error: 'Bu tabloya doğrudan yazma yetkiniz yok.', status: 403 };
  }
  if (ADMIN_WRITE_TABLES.has(table) && !isAdminSession(session)) {
    return { error: 'Bu işlem için yönetici (Müdür/Admin) yetkisi gereklidir.', status: 403 };
  }
  if (MANAGER_WRITE_TABLES.has(table) && !isManagerSession(session)) {
    return { error: 'Bu işlem için yönetici yetkisi gereklidir.', status: 403 };
  }

  // personnel: yöneticiler tam yetkili. Yönetici olmayanlar yalnızca KENDİ kayıtlarında
  // ve yalnızca hassas olmayan alanlarda (push token, konum vb.) değişiklik yapabilir.
  if (table === 'personnel' && !isManagerSession(session)) {
    const targetSicil = filters?.sicil_no;
    if (targetSicil === undefined || String(targetSicil) !== String(session.sicilNo)) {
      return { error: 'Yalnızca kendi personel kaydınızı güncelleyebilirsiniz.', status: 403 };
    }
    for (const row of rows) {
      for (const col of Object.keys(row)) {
        if (PERSONNEL_SENSITIVE_COLUMNS.has(col)) {
          return { error: `'${col}' alanını değiştirme yetkiniz yok.`, status: 403 };
        }
      }
    }
  }

  return null;
}

function parseFilters(searchParams: URLSearchParams): Array<{ column: string; op: string; value: string }> {
  const filters: Array<{ column: string; op: string; value: string }> = [];
  searchParams.getAll('filter').forEach(f => {
    const parts = f.split(':');
    if (parts.length >= 3) {
      filters.push({ column: parts[0], op: parts[1], value: parts.slice(2).join(':') });
    }
  });
  return filters;
}

function buildWhereClause(filters: Array<{ column: string; op: string; value: string }>, startIdx = 1): { clause: string; params: any[] } {
  if (filters.length === 0) return { clause: '', params: [] };
  
  const conditions: string[] = [];
  const params: any[] = [];
  let currentIdx = startIdx;
  
  filters.forEach((f) => {
    // Column name sanitization
    const col = f.column.replace(/[^a-zA-Z0-9_"]/g, '');
    switch (f.op) {
      case 'in':
        const vals = f.value.split(',');
        const placeholders = vals.map(() => `$${currentIdx++}`).join(', ');
        conditions.push(`"${col}" IN (${placeholders})`);
        params.push(...vals);
        break;
      case 'eq':
        if (f.value === 'null') { conditions.push(`"${col}" IS NULL`); }
        else { conditions.push(`"${col}" = $${currentIdx++}`); params.push(f.value); }
        break;
      case 'neq':
        if (f.value === 'null') { conditions.push(`"${col}" IS NOT NULL`); }
        else { conditions.push(`"${col}" != $${currentIdx++}`); params.push(f.value); }
        break;
      case 'gt': conditions.push(`"${col}" > $${currentIdx++}`); params.push(f.value); break;
      case 'gte': conditions.push(`"${col}" >= $${currentIdx++}`); params.push(f.value); break;
      case 'lt': conditions.push(`"${col}" < $${currentIdx++}`); params.push(f.value); break;
      case 'lte': conditions.push(`"${col}" <= $${currentIdx++}`); params.push(f.value); break;
      case 'like': conditions.push(`"${col}" LIKE $${currentIdx++}`); params.push(f.value); break;
      case 'ilike': conditions.push(`"${col}" ILIKE $${currentIdx++}`); params.push(f.value); break;
      default: conditions.push(`"${col}" = $${currentIdx++}`); params.push(f.value);
    }
  });

  return { clause: 'WHERE ' + conditions.join(' AND '), params };
}

/**
 * GET /api/db/[table] — SELECT
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const { table } = await params;
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: 'Geçersiz tablo adı.' }, { status: 400 });
    }

    // Okuma yetkilendirmesi (hassas tablolar için rol kontrolü)
    const readError = authorizeRead(session, table);
    if (readError) {
      return NextResponse.json({ error: readError.error }, { status: readError.status });
    }

    // Şema kurulumu (process başına bir kez, memoize)
    await ensureTableSchema(table);

    // GET'e özgü, zamana/veriye bağlı işlemler (memoize edilmez):
    if (table === 'temporary_assignments') {
      await query(`
        UPDATE public.temporary_assignments
        SET durum = 'GECIKTI'
        WHERE durum = 'AKTIF' AND tahmini_iade_tarihi < NOW()
      `).catch(err => console.error('[temporary_assignments] Auto-update GECIKTI error:', err));
    }
    if (table === 'fire_hydrants') {
      await query(`UPDATE public.fire_hydrants SET status = 'broken' WHERE durum IN ('Arızalı', 'Bakımda', 'DEVRE_DIŞI', 'broken', 'Arızalı Musluk');`);
      await query(`UPDATE public.fire_hydrants SET status = 'active' WHERE durum NOT IN ('Arızalı', 'Bakımda', 'DEVRE_DIŞI', 'broken', 'Arızalı Musluk') OR durum IS NULL;`);
    }
    if (table === 'vehicles') {
      await autoSeedVehiclesIfEmpty();
    }

    const { searchParams } = new URL(request.url);
    const select = searchParams.get('select') || '*';
    const filters = parseFilters(searchParams);
    const orderParam = searchParams.get('order');
    const limitParam = searchParams.get('limit');
    const countOnly = searchParams.get('count') === 'exact';

    const { clause, params: whereParams } = buildWhereClause(filters);

    let sql = '';
    if (countOnly) {
      sql = `SELECT COUNT(*) as count FROM ${table} ${clause}`;
    } else {
      // Select sanitization: allow * or comma-separated column names
      const safeCols = select === '*' ? '*' : select.split(',').map(c => `"${c.trim().replace(/[^a-zA-Z0-9_]/g, '')}"`).join(', ');
      sql = `SELECT ${safeCols} FROM ${table} ${clause}`;
    }

    if (orderParam) {
      const [col, dir] = orderParam.split(':');
      const safeCol = col.replace(/[^a-zA-Z0-9_"]/g, '');
      sql += ` ORDER BY "${safeCol}" ${dir === 'desc' ? 'DESC' : 'ASC'}`;
    }

    if (limitParam) {
      const limit = parseInt(limitParam, 10);
      if (!Number.isFinite(limit) || limit < 0) {
        return NextResponse.json({ error: 'Geçersiz limit parametresi.' }, { status: 400 });
      }
      sql += ` LIMIT ${limit}`;
    }

    const result = await query(sql, whereParams);

    if (countOnly) {
      return NextResponse.json({ count: parseInt(result.rows[0]?.count || '0', 10) });
    }

    return NextResponse.json({ data: stripSensitiveColumns(table, result.rows), count: result.rowCount });
  } catch (error: any) {
    console.error(`[db/GET] Hata:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/db/[table] — INSERT / UPSERT
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    // JWT yetki kontrolü
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const { table } = await params;
    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: 'Geçersiz tablo adı.' }, { status: 400 });
    }
    // system_settings yazımı yalnızca Admin rolüne açıktır.
    if (table === 'system_settings' && session.rol !== 'Admin') {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
    }

    // Şema kurulumu (process başına bir kez, memoize)
    await ensureTableSchema(table);

    const body = await request.json();
    const rows = Array.isArray(body.data) ? body.data : [body.data];
    const upsert = body.upsert === true;
    const conflictColumn = body.conflictColumn;

    // Yazma yetkilendirmesi (yetki yükseltme koruması)
    const writeError = authorizeWrite(session, table, rows);
    if (writeError) {
      return NextResponse.json({ error: writeError.error }, { status: writeError.status });
    }

    if (table === 'daily_summary_reports') {
      for (const row of rows) {
        const amirId = row.devreden_amir_id;
        let openAssignments: any[] = [];
        let openMaintenance: any[] = [];

        if (amirId) {
          // Fetch amir's posta
          const amirRes = await query('SELECT posta FROM public.personnel WHERE id = $1', [amirId]);
          const amirPosta = amirRes.rows[0]?.posta || '';
          
          if (amirPosta) {
            // Check for active/delayed assignments for personnel in this posta
            const openAssignmentsRes = await query(`
              SELECT t.id, t.birim_adi, m.malzeme_adi, t.teslim_edilen_tip
              FROM public.temporary_assignments t
              JOIN public.inventory m ON t.malzeme_id = m.id
              WHERE t.durum IN ('AKTIF', 'GECIKTI')
                AND t.teslim_edilen_tip = 'PERSONEL'
                AND EXISTS (
                  SELECT 1 FROM public.personnel p
                  WHERE p.posta = $1
                    AND (
                      t.birim_adi ILIKE '%' || p.ad || '%' AND t.birim_adi ILIKE '%' || p.soyad || '%'
                      OR t.birim_adi ILIKE '%' || p.sicil_no || '%'
                    )
                )
            `, [amirPosta]);
            openAssignments = openAssignmentsRes.rows;
          }
        }

        // Check for open maintenance logs without eski_sube
        const openMaintenanceRes = await query(`
          SELECT m.id, m.vehicle_id, m.ariza_seviyesi, m.aciklama, v.plaka
          FROM public.maintenance_logs m
          JOIN public.vehicles v ON m.vehicle_id = v.id
          WHERE m.durum IN ('Bakımda', 'Serviste', 'bakımda', 'serviste', 'BAKIMDA', 'SERVİSTE')
            AND (m.eski_sube IS NULL OR m.eski_sube = '')
        `);
        openMaintenance = openMaintenanceRes.rows;

        const hasOpenProcesses = openAssignments.length > 0 || openMaintenance.length > 0;

        if (hasOpenProcesses) {
          if (!row.force_override) {
            return NextResponse.json({
              error: "LOGISTICS_LOCKED",
              message: "Açıkta kalan lojistik süreçler veya Makine İkmal sevk logları kapatılmadan nöbet devir-teslim raporu mühürlenemez!",
              assignments: openAssignments,
              maintenance: openMaintenance
            }, { status: 400 });
          } else {
            // Compile details of open processes
            let detailsText = "SERHLI DEVIR NOTU:\n";
            if (openAssignments.length > 0) {
              detailsText += "Acik Zimmet Kayitlari:\n" + openAssignments.map(a => `- ${a.malzeme_adi} (${a.birim_adi} - ${a.teslim_edilen_tip})`).join("\n") + "\n";
            }
            if (openMaintenance.length > 0) {
              detailsText += "Acik Makine Ikmal Surecleri (Eski Subesi Yok):\n" + openMaintenance.map(m => `- ${m.plaka} (${m.ariza_seviyesi}: ${m.aciklama || ''})`).join("\n");
            }
            row.serh_notu = detailsText;
            row.devir_durumu = 'Serhli';
            delete row.force_override;
          }
        } else {
          row.devir_durumu = 'Temiz';
          if (row.hasOwnProperty('force_override')) {
            delete row.force_override;
          }
        }
      }
    }

    const insertedRows: any[] = [];

    for (const row of rows) {
      if (table === 'external_educations') {
        const allowed = ['Isyeri', 'Okul', 'Kamu Kurumu', 'Itfaiye Ziyaret', 'Ev-Site', 'Ekip Egitimi'];
        if (row.kurum_tipi && !allowed.includes(row.kurum_tipi)) {
          return NextResponse.json({ error: `Geçersiz kurum tipi: ${row.kurum_tipi}. Şunlardan biri olmalı: ${allowed.join(', ')}` }, { status: 400 });
        }
      }
      if (table === 'fire_hydrants' && row.status !== undefined) {
        row.durum = row.status === 'broken' ? 'DEVRE_DIŞI' : 'MEVCUT';
      }
      if (table === 'vehicles' && row.status !== undefined) {
        row.durum = row.status === 'maintenance' ? 'Bakımda' : 'aktif';
      }
      if (table === 'personnel') {
        // Generate username
        if (!row.username && row.ad && row.soyad) {
          const baseUsername = generateUsername(row.ad, row.soyad);
          let finalUsername = baseUsername;
          let counter = 1;
          while (true) {
            const check = await query('SELECT sicil_no FROM personnel WHERE username = $1', [finalUsername]);
            if (check.rows.length === 0) break;
            finalUsername = baseUsername + counter;
            counter++;
          }
          row.username = finalUsername;
        }

        // Handle password hashing if plain password is provided
        if (row.password) {
          const plainPassword = row.password;
          delete row.password; // remove plain password field before inserting to personnel table
          
          const hashed = await hashPassword(plainPassword);
          row.password_hash = hashed;

          // Insert/Upsert into temp_passwords
          await query(
            `INSERT INTO temp_passwords (sicil_no, username, ad, soyad, plain_password, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (sicil_no)
             DO UPDATE SET username = $2, ad = $3, soyad = $4, plain_password = $5, created_by = $6, created_at = NOW(), used = false, used_at = NULL`,
            [row.sicil_no, row.username || null, row.ad, row.soyad, plainPassword, session.sicilNo]
          );
        }
      }

      const keys = Object.keys(row);
      const safeCols = keys.map(k => `"${k.replace(/[^a-zA-Z0-9_]/g, '')}"`);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      const values = keys.map(k => {
        const val = row[k];
        if (val !== null && typeof val === 'object' && JSON_COLUMNS.includes(k)) {
          return JSON.stringify(val);
        }
        return val;
      });

      let sql = `INSERT INTO ${table} (${safeCols.join(', ')}) VALUES (${placeholders.join(', ')})`;
      
      if (upsert && conflictColumn) {
        const updateCols = safeCols.map((col, i) => `${col} = $${i + 1}`).join(', ');
        sql += ` ON CONFLICT ("${conflictColumn.replace(/[^a-zA-Z0-9_]/g, '')}") DO UPDATE SET ${updateCols}`;
      }

      sql += ' RETURNING *';

      const result = await query(sql, values);
      if (result.rows[0]) insertedRows.push(result.rows[0]);
    }

    if (table === 'duty_logs') {
      for (const row of insertedRows) {
        const actionType = row.action === 'START_DUTY' ? 'nobet_baslangic' : 'nobet_bitis';
        const details = row.action === 'START_DUTY' 
          ? { cihaz: 'Mobil/Web', tarih: new Date().toISOString(), geofence: '50m_ici' }
          : { cihaz: 'Mobil/Web', tarih: new Date().toISOString() };
        
        await query(
          `INSERT INTO audit_logs (action_type, actor_sicil_no, actor_name, target, details)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            actionType,
            session.sicilNo,
            `${session.ad} ${session.soyad}`,
            'Merkez İstasyonu',
            JSON.stringify(details)
          ]
        ).catch((err: unknown) => console.error('[Server AuditLog] Nöbet log yazma hatası:', err));
      }
    }

    if (table === 'incidents') {
      for (const row of insertedRows) {
        if (row.ek16_personel) {
          try {
            const pList = JSON.parse(row.ek16_personel);
            if (Array.isArray(pList) && pList.length > 0) {
              sendIncidentPushNotifications(row.id, pList).catch(err => {
                console.error('sendIncidentPushNotifications POST hatası:', err);
              });
              sendIncidentWhatsAppNotification(row.id, pList).catch(err => {
                console.error('sendIncidentWhatsAppNotification POST hatası:', err);
              });
            }
          } catch (e) {
            console.error('ek16_personel parse hatası:', e);
          }
        }
      }
    }

    return NextResponse.json({ data: stripSensitiveColumns(table, insertedRows), error: null });
  } catch (error: unknown) {
    console.error(`[db/POST] Hata:`, error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

/**
 * PATCH /api/db/[table] — UPDATE
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const { table } = await params;
    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: 'Geçersiz tablo adı.' }, { status: 400 });
    }
    // system_settings yazımı yalnızca Admin rolüne açıktır.
    if (table === 'system_settings' && session.rol !== 'Admin') {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
    }

    // Şema kurulumu (process başına bir kez, memoize)
    await ensureTableSchema(table);

    const body = await request.json();
    const { data, filters } = body;

    // Yazma yetkilendirmesi (yetki yükseltme koruması)
    const writeError = authorizeWrite(session, table, [data || {}], filters);
    if (writeError) {
      return NextResponse.json({ error: writeError.error }, { status: writeError.status });
    }

    // Sync durum/status on updates
    if (table === 'external_educations' && data && data.kurum_tipi !== undefined) {
      const allowed = ['Isyeri', 'Okul', 'Kamu Kurumu', 'Itfaiye Ziyaret', 'Ev-Site', 'Ekip Egitimi'];
      if (data.kurum_tipi && !allowed.includes(data.kurum_tipi)) {
        return NextResponse.json({ error: `Geçersiz kurum tipi: ${data.kurum_tipi}. Şunlardan biri olmalı: ${allowed.join(', ')}` }, { status: 400 });
      }
    }
    if (table === 'fire_hydrants' && data && data.status !== undefined) {
      data.durum = data.status === 'broken' ? 'DEVRE_DIŞI' : 'MEVCUT';
    }
    if (table === 'vehicles' && data && data.status !== undefined) {
      data.durum = data.status === 'maintenance' ? 'Bakımda' : 'aktif';
    }

    // Authorize vehicle inspection update
    if (table === 'vehicles' && data && data.next_inspection_date !== undefined) {
      const uRol = session.rol || '';
      const uUnvan = session.unvan || '';
      
      const isAuthorized = 
        uUnvan === 'Müdür' || uRol === 'Admin' || uRol?.toLowerCase() === 'admin' || uUnvan?.toLowerCase() === 'müdür' ||
        uUnvan === 'Amir' || uRol === 'Editor' || uRol?.toLowerCase() === 'editor' || uUnvan?.toLowerCase() === 'amir' ||
        uUnvan === 'Başçavuş' || uUnvan === 'Çavuş' || uRol === 'Shift_Leader' ||
        uUnvan.includes('Santral') || uUnvan.includes('İhbar') || uUnvan.includes('Memur') || uRol === 'Santral' ||
        uUnvan.toLowerCase().includes('santral') || uUnvan.toLowerCase().includes('ihbar') || uUnvan.toLowerCase().includes('memur');
        
      if (!isAuthorized) {
        return NextResponse.json({ error: 'Muayene tarihini değiştirme yetkiniz bulunmamaktadır.' }, { status: 403 });
      }
    }

    // Fetch previous inspection date if updating next_inspection_date in vehicles table
    let oldInspectionDate: string | null = null;
    if (table === 'vehicles' && data && data.next_inspection_date !== undefined) {
      const plaka = filters?.plaka;
      if (plaka) {
        try {
          const oldRowRes = await query('SELECT next_inspection_date, "muayeneBitis" FROM vehicles WHERE plaka = $1', [plaka]);
          if (oldRowRes.rows[0]) {
            oldInspectionDate = oldRowRes.rows[0].next_inspection_date || oldRowRes.rows[0].muayeneBitis || null;
          }
        } catch (e) {
          console.error('[Server AuditLog] Eski muayene tarihi okuma hatası:', e);
        }
      }
    }

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    Object.entries(data).forEach(([key, val]) => {
      setClauses.push(`"${key.replace(/[^a-zA-Z0-9_]/g, '')}" = $${idx}`);
      if (val !== null && typeof val === 'object' && JSON_COLUMNS.includes(key)) {
        values.push(JSON.stringify(val));
      } else {
        values.push(val);
      }
      idx++;
    });

    const whereClauses: string[] = [];
    Object.entries(filters || {}).forEach(([key, val]) => {
      whereClauses.push(`"${key.replace(/[^a-zA-Z0-9_]/g, '')}" = $${idx}`);
      values.push(val);
      idx++;
    });

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const sql = `UPDATE ${table} SET ${setClauses.join(', ')} ${whereStr} RETURNING *`;

    const result = await query(sql, values);

    // Dynamic Server-Side Audit Log hooks for vehicles next_inspection_date update
    if (table === 'vehicles' && result.rows[0] && data && data.next_inspection_date !== undefined) {
      const row = result.rows[0];
      const formatToISO = (d: any) => {
        if (!d) return 'Tarih Girilmedi';
        try {
          return new Date(d).toISOString().split('T')[0];
        } catch {
          return 'Tarih Girilmedi';
        }
      };
      const eski_tarih = formatToISO(oldInspectionDate);
      const yeni_tarih = formatToISO(row.next_inspection_date);
      
      await query(
        `INSERT INTO audit_logs (action_type, actor_sicil_no, actor_name, target, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'arac_muayene_guncelleme',
          session.sicilNo || 'SYSTEM',
          `${session.ad || ''} ${session.soyad || ''}`.trim() || 'Sistem',
          row.plaka,
          JSON.stringify({ eski_tarih, yeni_tarih })
        ]
      ).catch(err => console.error('[Server AuditLog] Araç muayene log yazma hatası:', err));
    }

    // 6. Dynamic Server-Side Audit Log hooks for fire_hydrants status update
    if (table === 'fire_hydrants' && result.rows[0]) {
      const row = result.rows[0];
      await query(
        `INSERT INTO audit_logs (action_type, actor_sicil_no, actor_name, target, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'hydrant_status_change',
          session.sicilNo,
          `${session.ad} ${session.soyad}`,
          String(row.id || row.no || ''),
          JSON.stringify({ id: row.id, no: row.no, newStatus: row.durum, tarih: new Date().toISOString() })
        ]
      ).catch(err => console.error('[Server AuditLog] Hidrant log yazma hatası:', err));
    }

    if (table === 'incidents' && result.rows.length > 0) {
      for (const row of result.rows) {
        if (row.ek16_personel) {
          try {
            const pList = JSON.parse(row.ek16_personel);
            if (Array.isArray(pList) && pList.length > 0) {
              sendIncidentPushNotifications(row.id, pList).catch(err => {
                console.error('sendIncidentPushNotifications PATCH hatası:', err);
              });
              sendIncidentWhatsAppNotification(row.id, pList).catch(err => {
                console.error('sendIncidentWhatsAppNotification PATCH hatası:', err);
              });
            }
          } catch (e) {
            console.error('ek16_personel parse hatası:', e);
          }
        }
      }
    }

    return NextResponse.json({ data: stripSensitiveColumns(table, result.rows), error: null });
  } catch (error: any) {
    console.error(`[db/PATCH] Hata:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/db/[table] — DELETE
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const { table } = await params;
    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: 'Geçersiz tablo adı.' }, { status: 400 });
    }
    // Silme yetkisi: izin kayıtlarında yazma yetkisiyle hizalı (Çavuş/Shift_Leader
    // izin oluşturabildiği için iptal de edebilmeli — aksi halde iptal akışı yarım
    // kalıp izin bir sonraki yüklemede geri geliyordu). Diğer tablolarda Admin/Editor.
    if (table === 'personnel_leaves') {
      if (!isManagerSession(session)) {
        return NextResponse.json({ error: 'Bu işlem için yönetici yetkisi gereklidir.' }, { status: 403 });
      }
    } else if (!['Admin', 'Editor'].includes(session.rol)) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
    }
    // system_settings silme yalnızca Admin rolüne açıktır.
    if (table === 'system_settings' && session.rol !== 'Admin') {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 });
    }

    // Şema kurulumu (process başına bir kez, memoize)
    await ensureTableSchema(table);

    const { searchParams } = new URL(request.url);
    const filters = parseFilters(searchParams);

    if (filters.length === 0) {
      return NextResponse.json({ error: 'Filtre olmadan toplu silme yapılamaz.' }, { status: 400 });
    }

    // Yazma yetkilendirmesi (denetim tabloları ve admin-only tablolar için ek koruma)
    const filterRecord: Record<string, unknown> = {};
    for (const f of filters) filterRecord[f.column] = f.value;
    const writeError = authorizeWrite(session, table, [], filterRecord);
    if (writeError) {
      return NextResponse.json({ error: writeError.error }, { status: writeError.status });
    }

    const { clause, params: whereParams } = buildWhereClause(filters);
    const sql = `DELETE FROM ${table} ${clause} RETURNING *`;

    const result = await query(sql, whereParams);
    return NextResponse.json({ data: stripSensitiveColumns(table, result.rows), error: null });
  } catch (error: any) {
    console.error(`[db/DELETE] Hata:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
