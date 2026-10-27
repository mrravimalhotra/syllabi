// A tiny in-memory stand-in for Supabase's query builder, enough for the
// routes under test: from().select/insert/update/delete with eq/neq/in/gt/gte filters,
// single/maybeSingle, counts, and a few rpc functions.

type Row = Record<string, unknown>;
export const tables: Record<string, Row[]> = {};
export const rpcs: Record<string, (args: Row) => unknown> = {};
export const authUsers = new Set<string>();
export const failures: { table?: string; message: string }[] = [];

export function resetDb() {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(rpcs)) delete rpcs[k];
  failures.length = 0;
  authUsers.clear();
}

let counter = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

type Result = { data: unknown; error: unknown; count?: number | null };

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private conflict: string[] = ["id"];
  private ignoreDuplicates = false;
  private from = 0;
  private sorts: { col: string; ascending: boolean }[] = [];
  private payload: Row | Row[] | null = null;
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private wantCount = false;
  private headOnly = false;
  private max = Infinity;

  constructor(private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.returning = true;
    else this.returning = true;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  upsert(p: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = p;
    this.conflict = (opts.onConflict ?? "id").split(",");
    this.ignoreDuplicates = opts.ignoreDuplicates ?? false;
    return this;
  }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, val: unknown) { this.filters.push((r) => r[col] === val); return this; }
  neq(col: string, val: unknown) { this.filters.push((r) => r[col] !== val); return this; }
  in(col: string, vals: unknown[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
  gte(col: string, val: unknown) { this.filters.push((r) => String(r[col] ?? "") >= String(val)); return this; }
  gt(col: string, val: unknown) { this.filters.push((r) => String(r[col] ?? "") > String(val)); return this; }
  not(col: string, _op: string, val: unknown) { this.filters.push((r) => r[col] !== val); return this; }
  lt(col: string, val: number) { this.filters.push((r) => Number(r[col]) < val); return this; }
  ilike(col: string, pattern: string) {
    const re = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");
    this.filters.push((r) => re.test(String(r[col] ?? "")));
    return this;
  }
  order(col?: string, opts: { ascending?: boolean } = {}) {
    if (col) this.sorts.push({ col, ascending: opts.ascending !== false });
    return this;
  }
  limit(n: number) { this.max = n; return this; }
  range(from: number, to: number) { this.from = from; this.max = to - from + 1; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  private run() {
    const failure = failures.find((f) => !f.table || f.table === this.table);
    if (failure) return { data: null, error: { message: failure.message, code: "XX000" }, count: null };
    const rows = (tables[this.table] ??= []);
    const matches = () => rows.filter((r) => this.filters.every((f) => f(r)));
    let result: Row[] = [];

    if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload!];
      result = items.map((p) => ({ id: nextId(), created_at: new Date().toISOString(), ...p }));
      rows.push(...result);
    } else if (this.op === "upsert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload!];
      // Like the database: a row already there is updated (or, with ignoreDuplicates, left alone and not returned).
      for (const item of items) {
        const same = rows.find((r) => this.conflict.every((k) => r[k] === item[k]));
        if (same && this.ignoreDuplicates) continue;
        if (same) {
          Object.assign(same, item);
          result.push(same);
        } else {
          const row = { id: nextId(), created_at: new Date().toISOString(), ...item };
          rows.push(row);
          result.push(row);
        }
      }
    } else if (this.op === "update") {
      result = matches();
      for (const r of result) Object.assign(r, this.payload);
    } else if (this.op === "delete") {
      result = matches();
      tables[this.table] = rows.filter((r) => !result.includes(r));
    } else {
      // The first order() is the main sort key, the next ones break ties (as in the database).
      const sorted = [...matches()].sort((a, b) => {
        for (const { col, ascending } of this.sorts) {
          const x = a[col] as string | number;
          const y = b[col] as string | number;
          if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      // Copies, as from a real database: changing a row read back must not change what is stored.
      result = structuredClone(sorted.slice(this.from, this.from + this.max));
    }

    const count = this.wantCount ? matches().length : null;
    if (this.headOnly) return { data: null, error: null, count };
    if (this.op !== "select" && !this.returning) return { data: null, error: null, count };
    if (this.mode === "single") {
      return result.length === 1
        ? { data: result[0], error: null, count }
        : { data: null, error: { message: "no single row", code: "PGRST116" }, count };
    }
    if (this.mode === "maybe") return { data: result[0] ?? null, error: null, count };
    return { data: result, error: null, count };
  }

  then<R1 = Result, R2 = never>(
    ok?: ((v: Result) => R1 | PromiseLike<R1>) | null,
    bad?: ((e: unknown) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return Promise.resolve()
      .then(() => this.run() as Result)
      .then(ok, bad);
  }
}

export const fakeAdmin = {
  from: (table: string) => new Query(table),
  rpc: async (name: string, args: Row = {}) => {
    // The size of the selected books' text, worked out from the fake chunks unless a test says otherwise.
    if (name === "chunk_text_size" && !rpcs[name]) {
      const wanted = args.p_document_ids as string[] | null;
      const mine = (tables.chunks ?? []).filter((c) => c.owner_id === args.p_owner_id && (!wanted || wanted.includes(c.document_id as string)));
      return { data: [{ chars: mine.reduce((n, c) => n + String(c.content ?? "").length, 0), chunks: mine.length }], error: null };
    }
    // The exact-word search finds nothing unless a test gives it results.
    if (name === "match_owner_chunks_text" && !rpcs[name]) return { data: [], error: null };
    const fn = rpcs[name];
    if (!fn) return { data: null, error: { message: `no fake for rpc ${name}` } };
    return { data: fn(args), error: null };
  },
  auth: {
    admin: {
      deleteUser: async () => ({ error: null }),
      createUser: async ({ email }: { email: string }) =>
        authUsers.has(email)
          ? { data: { user: null }, error: { message: "A user with this email address has already been registered" } }
          : (authUsers.add(email), { data: { user: { id: nextId() } }, error: null }),
    },
  },
};
