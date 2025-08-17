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
  const { Credentials } = await import("@t3-chat-clone/credentials");
  const cred = new Credentials();
  const env = await cred.get("DATABASE_URL");
  data(env, "n8xvzlvl4n7t5h0s9jkredt2").then(s => {
    if (!s) return;

    fs.withWs(
      `src/__out__/conversations/${s.title}/${s.id}.json`,
      JSON.stringify(s, null, 2)
    );
    return s;
  });
})();

if (process.argv[3] === "dev") {
  (async () => {
    data(process.env.DATABASE_URL ?? "", "ya1rl2a1anw3h0d8mkfun2gb").then(s => {
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
