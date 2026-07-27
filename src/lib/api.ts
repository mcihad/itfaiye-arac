/**
 * Client-side API yardımcısı.
 * Supabase client'ın yerine geçer.
 * Tüm veri işlemleri /api/db/[table] endpoint'i üzerinden yapılır.
 */

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in';

interface QueryFilter {
  column: string;
  op: FilterOp;
  value: any;
}

interface QueryBuilder<T = any> {
  _table: string;
  _select: string;
  _filters: QueryFilter[];
  _orderBy: string | null;
  _orderAsc: boolean;
  _limitVal: number | null;
  _single: boolean;

  select(columns?: string): QueryBuilder<T>;
  eq(column: string, value: any): QueryBuilder<T>;
  neq(column: string, value: any): QueryBuilder<T>;
  gt(column: string, value: any): QueryBuilder<T>;
  gte(column: string, value: any): QueryBuilder<T>;
  lt(column: string, value: any): QueryBuilder<T>;
  lte(column: string, value: any): QueryBuilder<T>;
  like(column: string, value: any): QueryBuilder<T>;
  ilike(column: string, value: any): QueryBuilder<T>;
  in(column: string, value: any[]): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  single(): QueryBuilder<T>;
  then(resolve: (value: { data: T | T[] | null; error: any; count?: number }) => void, reject?: (reason?: any) => void): void;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    try {
      const authData = localStorage.getItem('sivas-itfaiye-auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        if (parsed.state?.token) {
          headers['Authorization'] = `Bearer ${parsed.state.token}`;
        }
      }
    } catch (e) {}
  }
  return headers;
}

function createQueryBuilder<T = any>(table: string): QueryBuilder<T> {
  const builder: QueryBuilder<T> = {
    _table: table,
    _select: '*',
    _filters: [],
    _orderBy: null,
    _orderAsc: true,
    _limitVal: null,
    _single: false,

    select(columns = '*') {
      this._select = columns;
      return this;
    },
    eq(column, value) { this._filters.push({ column, op: 'eq', value }); return this; },
    neq(column, value) { this._filters.push({ column, op: 'neq', value }); return this; },
    gt(column, value) { this._filters.push({ column, op: 'gt', value }); return this; },
    gte(column, value) { this._filters.push({ column, op: 'gte', value }); return this; },
    lt(column, value) { this._filters.push({ column, op: 'lt', value }); return this; },
    lte(column, value) { this._filters.push({ column, op: 'lte', value }); return this; },
    like(column, value) { this._filters.push({ column, op: 'like', value }); return this; },
    ilike(column, value) { this._filters.push({ column, op: 'ilike', value }); return this; },
    in(column, value) { this._filters.push({ column, op: 'in', value: value.join(',') }); return this; },
    order(column, options) {
      this._orderBy = column;
      this._orderAsc = options?.ascending ?? true;
      return this;
    },
    limit(count) {
      this._limitVal = count;
      return this;
    },
    single() {
      this._single = true;
      this._limitVal = 1;
      return this;
    },

    then(resolve, reject) {
      const params = new URLSearchParams();
      params.set('select', this._select);
      
      this._filters.forEach(f => {
        params.append(`filter`, `${f.column}:${f.op}:${f.value}`);
      });
      
      if (this._orderBy) {
        params.set('order', `${this._orderBy}:${this._orderAsc ? 'asc' : 'desc'}`);
      }
      if (this._limitVal !== null) {
        params.set('limit', String(this._limitVal));
      }

      fetch(`/api/db/${this._table}?${params.toString()}`, {
        headers: getAuthHeaders()
      })
        .then(res => res.json())
        .then(json => {
          if (json.error) {
            resolve({ data: null, error: json.error, count: 0 });
          } else {
            const data = this._single ? (json.data?.[0] || null) : json.data;
            resolve({ data, error: null, count: json.count });
          }
        })
        .catch(err => {
          resolve({ data: null, error: err.message || String(err), count: 0 });
        });
    }
  };

  return builder;
}

/**
 * Yazma sonucunun error alanını denetler; hata varsa fırlatır.
 * api.insert/update/upsert/remove HTTP hatalarında reject ETMEZ, { error } döndürür.
 * Sonucu yok saymak sahte başarıya yol açar — kritik yazmalarda
 * `unwrap(await api.insert(...))` kullanın.
 */
export function unwrap<T extends { error?: any }>(result: T): T {
  if (result && result.error) {
    throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
  }
  return result;
}

/**
 * "YYYY-MM-DD" tarihine gün ekler ve yine "YYYY-MM-DD" döndürür.
 * new Date(str) + toISOString() ikilisi UTC/yerel kaymasıyla günü değiştirebildiği
 * için tarih aritmetiği yerel takvim üzerinden yapılır.
 */
export function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d + days).toLocaleDateString('en-CA');
}

export const api = {
  from<T = any>(table: string): QueryBuilder<T> {
    return createQueryBuilder<T>(table);
  },

  async insert(table: string, data: any | any[]) {
    try {
      const res = await fetch(`/api/db/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ data }),
      });
      return await res.json();
    } catch (err: any) {
      return { data: null, error: err.message || 'Bağlantı hatası' };
    }
  },

  async update(table: string, data: Record<string, any>, filters: Record<string, any>) {
    try {
      const res = await fetch(`/api/db/${table}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ data, filters }),
      });
      return await res.json();
    } catch (err: any) {
      return { data: null, error: err.message || 'Bağlantı hatası' };
    }
  },

  async upsert(table: string, data: any | any[], conflictColumn: string) {
    try {
      const res = await fetch(`/api/db/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ data, upsert: true, conflictColumn }),
      });
      return await res.json();
    } catch (err: any) {
      return { data: null, error: err.message || 'Bağlantı hatası' };
    }
  },

  async remove(table: string, filters: Record<string, any>) {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        params.append('filter', `${k}:eq:${v}`);
      });
      const res = await fetch(`/api/db/${table}?${params.toString()}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      return await res.json();
    } catch (err: any) {
      return { data: null, error: err.message || 'Bağlantı hatası' };
    }
  },

  async upload(file: File, folder?: string): Promise<{ url: string | null; error: string | null }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (folder) formData.append('folder', folder);
      
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      const json = await res.json();
      return { url: json.url || null, error: json.error || null };
    } catch (err: any) {
      return { url: null, error: err.message || 'Yükleme hatası' };
    }
  },
};
