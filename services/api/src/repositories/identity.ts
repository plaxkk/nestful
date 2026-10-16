import { createHash, randomBytes } from "node:crypto";
import { transaction, query, one, DomainError, iso } from "../db.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const userDto = (row: Record<string, any>) => ({
  id: row.id as string, nickname: row.nickname as string, avatarUrl: row.avatar_url as string | undefined,
  wechatOpenId: row.openid as string | undefined, createdAt: iso(row.created_at)!,
});

export const identityStore = {
  async createSession(input: { appId: string; openid: string; unionid?: string }) {
    if (!input.appId || !input.openid) throw new DomainError(502, "wechat_identity_missing");
    return transaction(async tx => {
      // Concurrent first logins must resolve to the same user without orphan users.
      await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${input.appId}:${input.openid}`]);
      let row = await one(tx, `select u.*,i.openid from nestful.wechat_identities i
        join nestful.users u on u.id=i.user_id where i.app_id=$1 and i.openid=$2`, [input.appId,input.openid]);
      if (!row) {
        row = (await one(tx,"insert into nestful.users default values returning *"))!;
        await tx.query(`insert into nestful.wechat_identities(user_id,app_id,openid,unionid) values($1,$2,$3,$4)`,
          [row.id,input.appId,input.openid,input.unionid ?? null]);
        row.openid = input.openid;
      } else if (input.unionid) {
        await tx.query("update nestful.wechat_identities set unionid=$3 where app_id=$1 and openid=$2",[input.appId,input.openid,input.unionid]);
      }
      if (row.status !== "active") throw new DomainError(403,"user_disabled");
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now()+30*24*60*60*1000).toISOString();
      await tx.query("insert into nestful.user_sessions(user_id,token_hash,expires_at) values($1,$2,$3)",[row.id,hash(token),expiresAt]);
      return {token,expiresAt,user:userDto(row),userId:row.id as string,wechatOpenId:input.openid,configured:true};
    });
  },
  async getUserSession(token: string | undefined) {
    if (!token) return undefined;
    const rows = await query(`select u.*,s.id session_id from nestful.user_sessions s join nestful.users u on u.id=s.user_id
      where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and u.status='active'`,[hash(token)]);
    return rows[0] ? {session:{id:rows[0].session_id as string},user:userDto(rows[0])} : undefined;
  },
  async revokeSession(token: string) {
    await query("update nestful.user_sessions set revoked_at=now() where token_hash=$1",[hash(token)]);
  },
};
