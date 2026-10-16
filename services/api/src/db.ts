import { Pool, type PoolClient, type QueryResultRow } from "pg";

export class DomainError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

let pool: Pool | undefined;
const getPool = () => {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required for relational storage");
  const endpoint = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if (process.env.PGSSL === "disable" && !local) throw new Error("Remote Postgres requires TLS");
  pool ??= new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 4, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000,
  });
  return pool;
};

export type Transaction = PoolClient;
export const transaction = async <T>(operation: (tx: Transaction) => Promise<T>): Promise<T> => {
  const tx = await getPool().connect();
  try {
    await tx.query("begin");
    // Also restrict old migration-owner credentials during the deployment transition.
    await tx.query("set local role nestful_runtime");
    const result = await operation(tx);
    await tx.query("commit");
    return result;
  } catch (error) {
    await tx.query("rollback");
    throw error;
  } finally { tx.release(); }
};

export const query = <T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) =>
  transaction(async (tx) => (await tx.query<T>(sql, values)).rows);

export const one = async <T extends QueryResultRow = QueryResultRow>(tx: Transaction, sql: string, values: unknown[] = []) =>
  (await tx.query<T>(sql, values)).rows[0];

export const closeDatabase = async () => { await pool?.end(); pool = undefined; };

export const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const assertUuid = (value: unknown) => {
  if (!uuid(value)) throw new DomainError(400, "invalid_id");
  return value;
};

export const audit = async (tx: Transaction, familyId: string, memberId: string | null, action: string, type: string, id: string) => {
  await tx.query(`insert into nestful.audit_events(family_id,actor_user_id,actor_member_id,action,resource_type,resource_id)
    select $1, m.user_id, m.id, $3, $4, $5 from (values (1)) seed(n)
    left join nestful.family_members m on m.id=$2 and m.family_id=$1`, [familyId, memberId, action, type, id]);
};

// Return plain DTOs, never database rows containing credentials or private columns.
export const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : undefined;
