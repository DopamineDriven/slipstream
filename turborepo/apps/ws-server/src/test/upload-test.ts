import { createReadStream } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import { Anthropic, toFile } from "@anthropic-ai/sdk";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { AttachmentSingleton, UserKeySingleton } from "@slipstream/types";

dotenv.config({ quiet: true, path: ".env" });

const fs = new Fs(process.cwd());

function safeErrMsg(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  } else if (typeof err === "object" && err != null) {
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
  } else if (typeof err === "string") {
    return err;
  } else if (typeof err === "number") {
    return err.toPrecision(5);
  } else if (typeof err === "boolean") {
    return `${err}`;
  } else return String(err);
}

const data = async (datasourceUrl: string) => {
  const { PrismaClient } = await import("@slipstream/db/node/generated/client");
  const prismaClient = new PrismaClient({
    datasourceUrl
  });
  prismaClient.$connect();
  try {
    const data = await prismaClient.attachment.findMany({
      where: { assetType: "IMAGE" },
      take: 10,
      skip: 5,
      orderBy: { createdAt: "desc" },
      include: {
        providerLinks: { include: { userKey: true } },
        document: true,
        image: true,
        imageGenOutput: true
      }
    });
    return data.map(t => {
      const { size, ...p } = t;
      const mapProviderSingleton = p?.providerLinks?.map(v => {
        const { size, userKey, ...s } = v;
        return {
          userKey: userKey as undefined | UserKeySingleton<true>,
          size: size ? Number(size) : null,
          ...s
        };
      });

      return {
        ...p,
        size: size ? Number(size) : null,
        providerLinks: mapProviderSingleton
      };
    });
  } catch (err) {
    throw new Error(
      typeof err === "string"
        ? err
        : err instanceof Error
          ? err.message
          : "there was a problem in providerLinks test query..."
    );
  } finally {
    prismaClient.$disconnect();
  }
};
async function urlExtWorkup(attachment: AttachmentSingleton<true>) {
  const arr = Array.of<{
    url: string;
    ext: string;
    mime: string;
  }>();
  const urlExtRecord = { url: "", ext: "", mime: "" };
  try {
    if (!attachment.compatStatus)
      throw new Error(
        `no compat status provided in attachment record ${attachment.id}`
      );
    if (
      attachment.compatStatus === "ACTIVE" &&
      attachment.compatExt &&
      attachment.compatCdnUrl &&
      attachment.compatMime
    ) {
      urlExtRecord.ext = attachment.compatExt;
      urlExtRecord.mime = attachment.compatMime;
      urlExtRecord.url = attachment.compatCdnUrl;
      arr.push(urlExtRecord);
    }
    if (
      attachment.compatStatus === "ALIASED" &&
      attachment.ext &&
      attachment.mime &&
      attachment.cdnUrl
    ) {
      urlExtRecord.ext = attachment.ext;
      urlExtRecord.mime = attachment.mime;
      urlExtRecord.url = attachment.cdnUrl;
      arr.push(urlExtRecord);
    }
  } catch (err) {
    throw new Error("error in urlExtWorkup".concat(safeErrMsg(err)));
  } finally {
    return urlExtRecord;
  }
}

async function toTmpWorkup({
  assetType,
  compatStatus,
  conversationId,
  messageId,
  id,
  userId,
  ...rest
}: AttachmentSingleton<true>) {
  const { ext, mime, url } = await urlExtWorkup({
    ...rest,
    assetType,
    compatStatus,
    conversationId,
    messageId,
    id,
    userId
  });

  const tmpPrefix = `anthropic-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;
  const tmpName = fs.uniqueTmpName(tmpPrefix, ext);
  const urlObj = new URL(url);

  let usefulName: string;
  if (conversationId && messageId) {
    // will always be defined as message and convoId for incoming assets are database derived and incoming user messages are persisted fully so AI SDKs always receive db-synced data
    usefulName = `${conversationId}-${messageId}-${id}-${assetType.toLowerCase()}.${ext}`;
  } else {
    usefulName = urlObj.pathname.replace(/\//gim, "-");
  }
  const safeFilename = usefulName;
  const absTmpPath = resolve(tmpdir(), tmpName);
  return {
    tmpFilenamePrefix: tmpPrefix,
    tmpUniquename: tmpName,
    absTmpPath,
    ext,
    remoteUrl: url,
    safeFilename,
    mime
  };
}

async function remoteToTmp(att: AttachmentSingleton<true>) {
  const workup = await toTmpWorkup(att);
  if (!workup) throw new Error("workup not defined");
  const {
    absTmpPath,
    ext,
    tmpUniquename,
    tmpFilenamePrefix,
    safeFilename,
    remoteUrl,
    mime
  } = workup;
  await fs.fetchRemoteWriteLocalLargeFiles(remoteUrl, absTmpPath, false);
  if (fs.existsTmp(tmpUniquename)) {
    return {
      tmpUniquename,
      absTmpPath,
      ext,
      tmpFilenamePrefix,
      safeFilename,
      mime
    };
  } else {
    throw new Error(
      `no tmp file exists having filename ${tmpUniquename} at absolute path ${absTmpPath}`
    );
  }
}



(async () => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const apiKey = await p.get("ANTHROPIC_API_KEY");
  const datasourceUrl = await p.get("DIRECT_URL");
  const helper = Array.of<Anthropic.Beta.Files.FileMetadata>();
  const start = performance.now();
  const claudeSdk = new Anthropic({
    apiKey
  });
  const ddd = (await data(datasourceUrl)) satisfies AttachmentSingleton<true>[];
  for (const d of ddd) {
    const getProps = await remoteToTmp(d);
    const upload = await claudeSdk.beta.files.upload({
      betas: ["files-api-2025-04-14"],
      file: await toFile(createReadStream(getProps.absTmpPath), undefined, {
        type: getProps.mime
      })
    });
    helper.push(upload);
    if (fs.exists(getProps.absTmpPath)) {
      console.log(`removing ${getProps.tmpUniquename} from tmp`);
      fs.rmFile(getProps.absTmpPath);
    }
  }
  console.log(`duration: ${performance.now() - start} ms`);
  return helper;
})().then(v => {
  console.log(v);
  return v;
});
