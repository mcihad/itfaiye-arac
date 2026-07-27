import { Pool, QueryResult, QueryResultRow } from 'pg';

// Singleton bağlantı havuzu
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Beklenmeyen bağlantı hatası:', err);
    });
  }
  return pool;
}

/**
 * Doğrudan SQL sorgusu çalıştır.
 */
export async function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await getPool().query<T>(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn(`[DB] Yavaş sorgu (${duration}ms): ${text.substring(0, 80)}...`);
  }
  return result;
}

/**
 * Bir dizi sorguyu GERÇEK bir transaction içinde çalıştırır.
 * pool.query() ile atılan BEGIN/COMMIT'ler havuzdan farklı bağlantılara
 * düşebildiği için atomiklik sağlamaz; transaction gerektiren her işlem
 * bu yardımcıyı kullanmalıdır. Hata durumunda ROLLBACK yapıp hatayı fırlatır.
 */
export async function withTransaction<T>(
  fn: (tx: <R extends QueryResultRow = any>(text: string, params?: any[]) => Promise<QueryResult<R>>) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn((text, params) => client.query(text, params));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[DB] ROLLBACK hatası:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Tek satır dönen sorgular için yardımcı.
 */
export async function queryOne<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

/**
 * Çoklu satır dönen sorgular için yardımcı.
 */
export async function queryMany<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

export default { query, queryOne, queryMany };
