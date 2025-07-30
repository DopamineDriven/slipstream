import { prismaClient } from "@/prisma/index.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const data = async () =>
  await prismaClient.conversation.findMany({ include: { messages: true } });

const fs = new Fs(process.cwd());
data()
  .then(v => {
    try {
      v.forEach(function (s) {
        fs.withWs(
          `src/__out__/bulk-new/md/${s.title?.concat("-" + s.id) ?? s.id}.md`,
          s.messages.find(t => t.senderType === "AI")?.content ?? ""
        );
      });
    } catch (err) {
      console.error(err);
    } finally {
      return v;
    }
  })
  .then(v => {
    return v.map(t => {
      return t.messages.map(w => {
        if (t.id === "y13vfghrg0f3oyypvyf3zx6n")
          console.log(JSON.stringify(w.content));
        return w;
      });
    });
  });
