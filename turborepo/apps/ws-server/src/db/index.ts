import { Pool } from "@neondatabase/serverless";

export type UserQuery = {
  id: string;
  name: string;
  email: string;
  emailVerified?: Date;
  image: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class DbService {
  constructor(public pool: Pool) {}

  public async isValidUserAndSession(userId: string) {
    const { rows, rowCount } = await this.pool.query<UserQuery>(
      `SELECT * FROM "public"."User" WHERE "public"."User"."id" = $1`,
      [userId]
    );
    if (rowCount === null || rowCount === 0) return false;
    const ourUser = rows[0];
    if (!ourUser?.id) return false;
    const { rows: sessionRows } = await this.pool.query(
      `SELECT * FROM "public"."Session" WHERE "public"."Session"."userId" = $1 AND "public"."Session"."expires" > NOW()`,
      [userId]
    );
    console.log(sessionRows);
    return sessionRows.length > 0;
  }

  public async isValidUserAndSessionByEmail(userEmail: string) {
    const { rows, rowCount } = await this.pool.query<UserQuery>(
      `SELECT * FROM "public"."User" WHERE "public"."User"."email" = $1`,
      [userEmail]
    );
    if (!rowCount || rowCount === 0) return false;
    const ourUser = rows[0];
    if (!ourUser?.id) return false;
    const { rows: sessionRows } = await this.pool.query(
      `SELECT * FROM "public"."Session" WHERE "public"."Session"."userId" = $1 AND "public"."Session"."expires" > NOW()`,
      [ourUser.id]
    );
    console.log(sessionRows);
    return { valid: sessionRows.length > 0, id: ourUser.id };
  }
}
