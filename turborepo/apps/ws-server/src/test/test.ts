import { prismaClient } from "@/prisma/index.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const data = async () =>
  await prismaClient.conversation.findUnique({
    where: { id: "p13p137q681ur9qeiuucsvmj" },
    include: { messages: {orderBy: {createdAt: "asc"}} }
  });

const fs = new Fs(process.cwd());

data().then(s => {
  if (!s) return;

  fs.withWs(
    `src/__out__/conversations/${s.title}/${s.id}.json`,
    JSON.stringify(s, null, 2)
  );
  return s;
});
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
