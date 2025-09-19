import type { $Enums } from "@/generated/client/client.ts";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

type DataRT =
  | ({
      messages: ({
        attachments: {
          id: string;
          userId: string;
          createdAt: Date;
          updatedAt: Date;
          batchId: string | null;
          conversationId: string | null;
          s3ObjectId: string | null;
          draftId: string | null;
          messageId: string | null;
          origin: $Enums.AssetOrigin;
          status: $Enums.AssetStatus;
          uploadMethod: $Enums.UploadMethod;
          assetType: $Enums.AssetType;
          uploadDuration: number | null;
          cdnUrl: string | null;
          publicUrl: string | null;
          sourceUrl: string | null;
          thumbnailKey: string | null;
          bucket: string;
          key: string;
          versionId: string | null;
          region: string;
          cacheControl: string | null;
          contentDisposition: string | null;
          contentEncoding: string | null;
          expiresAt: Date | null;
          size: bigint | null;
          filename: string | null;
          ext: string | null;
          mime: string | null;
          etag: string | null;
          checksumAlgo: $Enums.ChecksumAlgo;
          checksumSha256: string | null;
          storageClass: string | null;
          sseAlgorithm: string | null;
          sseKmsKeyId: string | null;
          s3LastModified: Date | null;
          deletedAt: Date | null;
        }[];
      } & {
        id: string;
        userId: string | null;
        provider: $Enums.Provider;
        createdAt: Date;
        updatedAt: Date;
        userKeyId: string | null;
        conversationId: string;
        model: string | null;
        senderType: $Enums.SenderType;
        content: string;
        thinkingText: string | null;
        thinkingDuration: number | null;
        liked: boolean | null;
        disliked: boolean | null;
        tryAgain: boolean | null;
      })[];
    } & {
      id: string;
      userId: string;
      createdAt: Date;
      updatedAt: Date;
      userKeyId: string | null;
      title: string | null;
      branchId: string | null;
      parentId: string | null;
      isShared: boolean;
      shareToken: string | null;
    })[]
  | undefined;

const data = async (env: string) => {
  const { PrismaClient } = await import("@/generated/client/client.ts");
  const prismaClient = new PrismaClient({ datasourceUrl: env });
  try {
    prismaClient.$connect();
    return (await prismaClient.conversation.findMany({
      where: {
        messages: { some: { attachments: { some: { NOT: undefined } } } }
      },
      include: {
        messages: { include: { attachments: true } }
      }
    })) satisfies DataRT;
  } catch (err) {
    console.error(err);
  } finally {
    prismaClient.$disconnect();
  }
};

(async () => {
  const { Fs } = await import("@d0paminedriven/fs");
  const fs = new Fs(process.cwd());
  data(process.env.DIRECT_URL ?? "").then(s => {
    if (!s) return;
    function processNesting(props: DataRT) {
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
