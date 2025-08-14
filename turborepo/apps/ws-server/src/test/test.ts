import { PrismaClient } from "@/generated/client/client.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { Credentials } from "@t3-chat-clone/credentials";

dotenv.config({ quiet: true });

const data = async (env: string) => {
  const prismaClient = new PrismaClient({ datasourceUrl: env });
  try {
    prismaClient.$connect();
    return await prismaClient.conversation.findUnique({
      where: { id: "jm2jtoa6wd2c1ywfb3jj5i55" },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
  } catch (err) {
    console.error(err);
  } finally {
    prismaClient.$disconnect();
  }
};
const fs = new Fs(process.cwd());

(async () => {
  const cred = new Credentials();
  const env = await cred.get("DATABASE_URL");
  data(env).then(s => {
    if (!s) return;

    fs.withWs(
      `src/__out__/conversations/${s.title}/${s.id}.json`,
      JSON.stringify(s, null, 2)
    );
    return s;
  });
})();
// data()
//   .then(v => {
//     try {
//       v.forEach(function (s) {
//         fs.withWs(
//           `src/__out__/bulk-new/md/${s.title?.concat("-" + s.id) ?? s.id}.md`,
//           s.messages.find(t => t.senderType === "AI")?.content ?? ""
//         );
//       });
//     } catch (err) {
//       console.error(err);
//     } finally {
//       return v;
//     }
//   })
//   .then(v => {
//     return v.map(t => {
//       return t.messages.map(w => {
//         if (t.id === "y13vfghrg0f3oyypvyf3zx6n")
//           console.log(w.content);
//         return w;
//       });
//     });
//   });
