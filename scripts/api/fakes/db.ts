// A tiny in-memory stand-in for Supabase's query builder, enough for the
// routes under test: from().select/insert/update/delete with eq/neq/in filters,
// single/maybeSingle, counts, and a few rpc functions.

type Row = Record<string, unknown>;
export const tables: Record<string, Row[]> = {};
export const rpcs: Record<string, (args: Row) => unknown> = {};
export const failures: { table?: string; message: string }[] = [];

export function resetDb() {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(rpcs)) delete rpcs[k];
  failures.length = 0;
}

let counter = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

type Result = { data: unknown; error: unknown; count?: number | null };

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
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
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, val: unknown) { this.filters.push((r) => r[col] === val); return this; }
  neq(col: string, val: unknown) { this.filters.push((r) => r[col] !== val); return this; }
  in(col: string, vals: unknown[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
  not(col: string, _op: string, val: unknown) { this.filters.push((r) => r[col] !== val); return this; }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
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
    } else if (this.op === "update") {
      result = matches();
      for (const r of result) Object.assign(r, this.payload);
    } else if (this.op === "delete") {
      result = matches();
      tables[this.table] = rows.filter((r) => !result.includes(r));
    } else {
      result = matches().slice(0, this.max);
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
    const fn = rpcs[name];
    if (!fn) return { data: null, error: { message: `no fake for rpc ${name}` } };
    return { data: fn(args), error: null };
  },
  auth: { admin: { deleteUser: async () => ({ error: null }) } },
};
