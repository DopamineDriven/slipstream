import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });
class ScriptTest extends Fs {
  constructor(public override cwd: string) {
    super(process.cwd() ?? cwd);
  }

  private data = async (env: string) => {
    const { PrismaClient } = await import(
      "@slipstream/db/node/generated/client"
    );
    const prismaClient = new PrismaClient({ datasourceUrl: env });
    try {
      prismaClient.$connect();
      return await prismaClient.conversation.findMany({
        take: 150,
        include: {
          conversationSettings: true,
          messages: {
            orderBy: { createdAt: "asc" },
            include: {
              imageGenJob: true,
              attachments: {
                where: {
                  OR: [
                    { origin: { not: "GENERATED" } },
                    {
                      AND: [
                        { origin: "GENERATED" },
                        { imageGenOutput: { kind: "FINAL" } }
                      ]
                    }
                  ]
                },
                orderBy: { createdAt: "asc" },
                include: {
                  image: true,
                  document: true,
                  imageGenOutput: true
                }
              }
            }
          }
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      prismaClient.$disconnect();
    }
  };

  public async Dev() {
    return await this.data(process.env.DIRECT_URL ?? "").then(s => {
      if (!s) return;
      return s.map(t => {
        const ss = t.messages.map(p => {
          const { attachments, ...rest } = p;

          const cleanAtts = attachments.map(ttt => {
            return {
              ...ttt,
              size: Number(ttt.size)
            };
          });
          return { attachments: cleanAtts, ...rest };
        });

        this.withWs(
          `src/test/__out__/conversations/out/${t.title}/${t.id}.json`,
          JSON.stringify(ss, null, 2)
        );
        return t;
      });
    });
  }
}
const s = new ScriptTest(process.cwd());

(async () => {
  return await s.Dev();
})().then(v => {
  console.log(v);
});
