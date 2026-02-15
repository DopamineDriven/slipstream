import { Fs } from "@d0paminedriven/fs";
import { config } from "dotenv";
import type { Account, User } from "@slipstream/db/node/generated/client";

type AccountToUser = ({
  user: User;
} & Account)[];

config({ quiet: true });
class MigrateIt extends Fs {
  constructor(public override cwd: string) {
    super((cwd ??= process.cwd()));
  }
  private data = async (env: string) => {
    const { PrismaDbService } = await import("@slipstream/db/factory");
    const prismaClient = new PrismaDbService({
      connectionString: env
    }).p(false);
    let toFinally: AccountToUser | null = null;
    try {
      prismaClient.$connect();
      const getMany = await prismaClient.account.findMany({
        include: { user: true }
      });
      toFinally = getMany;
      return getMany;
    } catch (err) {
      console.error(err);
    } finally {
      prismaClient.$disconnect();
      return toFinally;
    }
  };

  public async inspectData() {
    const getData = await this.data(process.env.DIRECT_URL ?? "");

    if (!getData) throw new Error("getData returned null...?");
    this.withWs(
      "src/test/__out__/json/accounts-and-users.json",
      JSON.stringify(getData, null, 2)
    );
    return getData;
  }
}
const migrate = new MigrateIt(process.cwd());

(async () => {
  return await migrate.inspectData();
})()
  .then(v =>
    v.map(kv => {
      console.log(kv);
      return kv;
    })
  )
  .then(async p => {
    const { PrismaDbService } = await import("@slipstream/db/factory");
    const prisma = new PrismaDbService({
      connectionString: process.env.DATABASE_URL ?? ""
    }).p(false);
    try {
      prisma.$connect();
      for (const o of p) {
        if (o.user) {
          const { user, userId: _uid, ...rest } = o;

          return await prisma.user.update({
            include: { accounts: true },
            data: {
              isAnonymous: user.emailVerified ? false : true,
              email_verified: user.emailVerified ? true : false,
              lastLoginMethod: rest.provider,
              accounts: {
                upsert: [
                  {
                    where: {
                      provider_providerAccountId: {
                        provider: rest.provider,
                        providerAccountId: rest.providerAccountId
                      }
                    },
                    create: { ...rest },
                    update: {
                      accessTokenExpiresAt: rest.expires_at
                        ? new Date(rest.expires_at * 1000)
                        : null
                    }
                  }
                ]
              }
            },
            where: { id: user.id }
          });
        } else {
          console.log(o);
          return o;
        }
      }

      return p;
    } catch (err) {
      console.error(err);
    } finally {
      prisma.$disconnect();
      return p;
    }
  });
