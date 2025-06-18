import { Pool } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export type UserQuery = {
  id: string;
  name: string;
  email: string;
  emailVerified?: Date;
  imaeg: string;
  createdAt?: Date;
  updatedAt?: Date;
}

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
    if (!rowCount || rowCount ===0) return false;
    const ourUser = rows[0];
    if (!ourUser?.id) return false;
    const { rows: sessionRows } = await this.pool.query(
      `SELECT * FROM "public"."Session" WHERE "public"."Session"."userId" = $1 AND "public"."Session"."expires" > NOW()`,
      [ourUser.id]
    );
    console.log(sessionRows);
    return {valid: sessionRows.length > 0, id: ourUser.id};
  }
}

export const db = new DbService(pool);

// const _test = db.isValidUserAndSession("9f51e5e2-e89c-40a9-825e-2b9b4f9bbfd5");
// const test2 = db.isValidUserAndSessionByEmail("andrew@windycitydevs.io")
// test2.then(t => {
//   console.log(t);
//   return t;
// });

