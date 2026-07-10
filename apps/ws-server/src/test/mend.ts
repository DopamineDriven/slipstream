import { Fs } from "@d0paminedriven/fs";
import { Extract } from "@d0paminedriven/metadata";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });
class Extractor extends Fs {
  constructor(public extract: Extract) {
    super(process.cwd());
  }

  private data = async (env: string, id: string) => {
    const { PrismaDbService } = await import("@slipstream/db/factory");
    const prismaClient = new PrismaDbService({
      connectionString: env
    }).p(false);
    try {
      prismaClient.$connect();
      return await prismaClient.attachment.findMany({
        orderBy: { createdAt: "asc" },
        select: { cdnUrl: true, publicUrl: true },
        where: { conversationId: id }
      });
    } catch (err) {
      console.error(err);
    } finally {
      prismaClient.$disconnect();
    }
  };
  public async Dev(id = "hv3hmzfj9lpbmej1cxm3r7ur") {
    const arr = Array.of<string>();
    try {
      await this.data(process.env.DIRECT_URL ?? "", id).then(async s => {
        if (!s) throw new Error("no data returned");
        s.forEach(function (sss) {
          console.log(sss.cdnUrl);
          if (sss.cdnUrl) {
            arr.push(sss.cdnUrl);
          }
        });
      });
    } finally {
      this.withWs(
        `src/test/__out__/extractor-data/${id}.json`,
        JSON.stringify(arr, null, 2)
      );
      return arr;
    }
  }

  public async extractIt(id = "hv3hmzfj9lpbmej1cxm3r7ur") {
    return await this.Dev(id);
  }
}

const extractor = new Extractor(new Extract());

(async () => {
  const data = await extractor.extractIt();
  return data;
})().then(async v => {
  console.log(v.length);

  return v;
});
