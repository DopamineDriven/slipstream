import { tmpdir } from "os";
import { resolve } from "path";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { AttachmentSingleton, UserKeySingleton } from "@slipstream/types";

dotenv.config({ quiet: true });

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
      where: { assetType: "DOCUMENT" },
      take: 5,
      skip: 20,
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

  const tmpPrefix = `xai-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;
  const tmpName = fs.uniqueTmpName(tmpPrefix, ext);


  const urlObj = new URL(url);

  const path = urlObj.pathname.slice(urlObj.pathname.lastIndexOf("/") + 1);

  const filename = path
    .split(/(-)/gim)
    .filter((_, o) => o >= 2)
    .join("");

  const withoutExt = (filename.split(".")?.[0] ??"")

  const toHex = Buffer.from(withoutExt, "utf-8").toString("hex");

  let usefulName: string;

  if (conversationId && messageId) {
    // will always be defined as message and convoId for incoming assets are database derived and incoming user messages are persisted fully so AI SDKs always receive db-synced data
    usefulName = `${conversationId}-${messageId}-${id}-${toHex}.${ext}`;
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


async function fetchRemoteToTmp(att: AttachmentSingleton<true>) {
  const workup = await toTmpWorkup(att);
  if (!workup) throw new Error(`xai workup for ${att.id} not defined`);
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
      remoteUrl,
      ext,
      tmpFilenamePrefix,
      safeFilename,
      mime
    };
  } else {
    throw new Error(
      `no tmp file exists having filename ${tmpUniquename} at absolute path ${absTmpPath} exist for provider xai`
    );
  }
}

function cleanupTmpPostupload(absTmpPath: string, tmpUniquename: string) {
  try {
    if (fs.exists(absTmpPath)) {
      fs.rmFile(absTmpPath);
      console.log(
        `cleaned up tmp file ${tmpUniquename} following xai file upload.`
      );
    }
  } catch (err) {
    console.warn(
      `cleanup of tmp file ${tmpUniquename} having path ${absTmpPath} failed following xai file upload.`.concat(
        safeErrMsg(err)
      )
    );
  }
}

async function fetchXai(att: AttachmentSingleton<true>, apiKey: string) {
  const { absTmpPath, tmpUniquename, mime, safeFilename } =
    await fetchRemoteToTmp(att);
  try {
    const F = new FormData();
    // requires a file object to derive name  from...
    const x = fs.fileToBuffer(absTmpPath);

    const file = new File([x], safeFilename, { type: mime });

    F.set("file", file, safeFilename);
    // F.append("purpose", new Blob(["assistants"]), safeFilename);
    const fetcher = await fetch(
      "https://api.x.ai/v1/files?purpose=assistants",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        method: "POST",
        body: F
      }
    );
    return await fetcher.json();
  } catch (err) {
    console.error(safeErrMsg(err));
  } finally {
    cleanupTmpPostupload(absTmpPath, tmpUniquename);
  }
}

type UploadRT = {
  bytes: number;
  created_at: number;
  expires_at: null;
  filename: string;
  id: string;
  object: "file";
  purpose: string;
};

type ResShape = { data: UploadRT[]; pagination_token: null | string | number };

(async () => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const apiKey = await p.get("X_AI_KEY");
  const datasourceUrl = await p.get("DIRECT_URL");
  const helper = Array.of<unknown>();
  const start = performance.now();

  const ddd = (await data(datasourceUrl)) satisfies AttachmentSingleton<true>[];
  for (const d of ddd) {
    const upload = (await fetchXai(d, apiKey)) as ResShape;
    console.log(upload);
    helper.push(upload);
  }
  console.log(`duration: ${performance.now() - start} ms`);
  return helper;
})().then(v => {
  fs.withWs(
    `src/test/__out__/xai/files/upload.json`,
    JSON.stringify(v, null, 2)
  );
  console.log(v);
  return v;
});
