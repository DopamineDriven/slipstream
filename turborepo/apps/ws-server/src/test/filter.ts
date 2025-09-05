import { PrismaClient } from "@/generated/client/client.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const data = async (env: string) => {
  const prismaClient = new PrismaClient({ datasourceUrl: env });
  try {
    prismaClient.$connect();
    return await prismaClient.conversation.findMany({
      where: {
        messages: { some: { attachments: { some: { NOT: undefined } } } }
      },
      include: {
        messages: { include: { attachments: true } }
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    prismaClient.$disconnect();
  }
};

const fs = new Fs(process.cwd());

(async () => {
  data(process.env.DATABASE_URL ?? "").then(s => {
    if (!s) return;
    function processNesting(props: typeof s) {
      return props
        ?.map(t => {
          const { messages, ...rest } = t;

          const msgs = messages.map(v => {
            const { attachments, ...rest } = v;
            const cleanedAttachments = attachments.map(att => ({
              ...att,
              size: Number(att.size)
            }));
            return { ...rest, attachments: cleanedAttachments };
          });
          return { ...rest, messages: msgs };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    fs.withWs(
      "src/__out__/attachments/conversations-to-messages-to-attachments/bulk.json",
      JSON.stringify(processNesting(s), null, 2)
    );
    return s;
  });
})();

// if (process.argv[3] === "dev") {
//   (async () => {
//     data(process.env.DATABASE_URL ?? "", "ya1rl2a1anw3h0d8mkfun2gb").then(s => {
//       if (!s) return;
//       console.log(s);
//       fs.withWs(
//         `src/__out__/conversations/${s.title}/${s.id}.json`,
//         JSON.stringify(s, null, 2)
//       );
//       return s;
//     });
//   })();
// }
