import { resolve } from "path";
import { PrismaClient } from "@/generated/client/client.ts";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const _data = async (env: string, _id: string) => {
  const prismaClient = new PrismaClient({ datasourceUrl: env });
  try {
    prismaClient.$connect();
    return await prismaClient.conversation.findMany({
      where: { attachments: { every: { NOT: undefined } } },
      include: {
        attachments: true,
        messages: true
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    prismaClient.$disconnect();
  }
};
const url =
  "https://ws-server-assets-dev.s3.us-east-1.amazonaws.com/upload/nrr6h4r4480f6kviycyo1zhf/1756429654602-impossible-star.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA3MSF7Z3NS5XCR5MM%2F20250829%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20250829T010736Z&X-Amz-Expires=604800&X-Amz-Signature=f46cf6a0e3f9b2310601b2d5458f9c232d9139dd7c62903bbfc85e4ebc14215d&X-Amz-SignedHeaders=host&versionId=gCWa5pnWMNGT5Ws_aZS2aj_ldwZEh1fd&x-amz-checksum-mode=ENABLED&x-id=GetObject";
const fs = new Fs(process.cwd());
const getFileName = (p: string) =>
  p.split("?")[0]?.split("/").reverse()[0] ?? "";
let p0 = 0;
const _y =(async () => {
  const absPath = resolve(fs.tmpDir, getFileName(url));
console.log(absPath)
  p0 = performance.now();
  return await fs
    .fetchRemoteWriteLocalLargeFiles(
      url,
      absPath,
      false
    )
    .then(_ => {
      console.log(performance.now() - p0);
      console.log(fs.readTmp(getFileName(url)));
    });
})();

// (async () => {
//   data(process.env.DATABASE_URL ?? "", "ya1rl2a1anw3h0d8mkfun2gb").then(s => {
//     if (!s) return;
//     for (const ss of s) {
//       const { attachments, ...rest } = ss;
//       const atts = attachments.map(t => {
//         const { size, ...rest } = t;
//         const newSize = size !== null ? Number(size) : size;
//         return { ...rest, size: newSize };
//       });
//       const reconstruct = { attachments: atts, ...rest };
//       fs.withWs(
//         `src/__out__/conversations/with-attachments/${reconstruct.title}.json`,
//         JSON.stringify(reconstruct, null, 2)
//       );
//     }
//     return s;
//   });
// })();
