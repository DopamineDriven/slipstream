import { PrismaClient } from "@/generated/client/client.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const data = async (env: string, id: string) => {
  const prismaClient = new PrismaClient({ datasourceUrl: env });
  try {
    prismaClient.$connect();
    return await prismaClient.conversation.findUnique({
      where: { id: id },
      include: { messages: { orderBy: { createdAt: "asc" } }}
    });
  } catch (err) {
    console.error(err);
  } finally {
    prismaClient.$disconnect();
  }
};
const fs = new Fs(process.cwd());

(async () => {
  const { Credentials } = await import("@t3-chat-clone/credentials");
  const cred = new Credentials();
  const env = await cred.get("DATABASE_URL");
  data(env, "e7imrkcwuoib4lui7l057h56").then(s => {
    if (!s) return;

    // for (const ss of s.messages) {
    //   ss.senderType === "AI"
    //     ? console.log({ thinkingText: ss.thinkingText ?? "" })
    //     : ss;
    // }

    fs.withWs(
      `src/__out__/conversations/${s.title}/${s.id}.json`,
      JSON.stringify(s, null, 2)
    );
    return s;
  });
})();

if (process.argv[3] === "dev") {
  (async () => {
    data(process.env.DATABASE_URL ?? "", "tsc8ukfhxdddj4pykubzix1i").then(s => {
      if (!s) return;
      console.log(s);
      fs.withWs(
        `src/__out__/conversations/${s.title}/${s.id}.json`,
        JSON.stringify(s, null, 2)
      );
      return s;
    });
  })();
}
