import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { AttachmentSingleton, UserKeySingleton } from "@slipstream/types";

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

const data = async (datasourceUrl: string, skip: number) => {
  const { PrismaDbService } = await import("@slipstream/db/factory");
  const prismaClient = new PrismaDbService({
    connectionString: datasourceUrl
  }).p(false);
  prismaClient.$connect();
  try {
    const data = await prismaClient.attachment.findFirstOrThrow({
      where: { assetType: "DOCUMENT" },
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        providerLinks: { include: { userKey: true } },
        document: true,
        image: true,
        imageGenOutput: true
      }
    });

    const { size, ...p } = data;
    console.log(data.filename);
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

async function toTmpWorkup({
  assetType,
  compatStatus,
  conversationId,
  messageId,
  id,
  userId,
  ...rest
}: AttachmentSingleton<true>) {
  const { ext, mime, url, xaiFilename } = urlExtWorkup({
    ...rest,
    assetType,
    compatStatus,
    conversationId,
    messageId,
    id,
    userId
  });

  const toTmpWorkupObj = {
    absTmpPath: "",
    tmpPrefix: "",
    tmpName: "",
    safeFilename: ""
  };

  toTmpWorkupObj.tmpPrefix = `xai-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;

  toTmpWorkupObj.tmpName = fs.uniqueTmpName(toTmpWorkupObj.tmpPrefix, ext);

  const urlObj = new URL(url);

  let usefulName: string;

  if (conversationId && messageId) {
    // will always be defined as message and convoId for incoming assets are
    // database derived and incoming user messages are persisted fully so AI SDKs always receive db-synced data
    usefulName = xaiFilename;
  } else {
    usefulName = urlObj.pathname.replace(/\//gim, "-");
  }
  toTmpWorkupObj.safeFilename = usefulName;
  toTmpWorkupObj.absTmpPath = resolve(tmpdir(), toTmpWorkupObj.tmpName);
  return {
    tmpFilenamePrefix: toTmpWorkupObj.tmpPrefix,
    tmpUniquename: toTmpWorkupObj.tmpName,
    absTmpPath: toTmpWorkupObj.absTmpPath,
    ext,
    remoteUrl: url,
    safeFilename: toTmpWorkupObj.safeFilename,
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

async function uploadFile(F: FormData, apiKey: string) {
  return await fetch("https://api.x.ai/v1/files?purpose=assistants", {
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    method: "POST",
    body: F
  });
}

function urlExtWorkup(attachment: AttachmentSingleton<true>) {
  const urlExtRecord = { url: "", ext: "", mime: "", xaiFilename: "" };
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
      urlExtRecord.xaiFilename = toXaiFilename(attachment);
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
      urlExtRecord.xaiFilename = toXaiFilename(attachment);
    }
  } catch (err) {
    throw new Error("error in urlExtWorkup ".concat(safeErrMsg(err)));
  } finally {
    return urlExtRecord;
  }
}
/**
 * all cdnUrls have a final path prefixed with a timestamp (ms), eg:
 *
 * `https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758334065329-IMG_6695.png`
 *
 *  -> `pathname.slice(14)` simply excises the predictably prefixed `1758334065329-` from the filename
 *
 * that said, converted (comapt) attachments lack the timestamp and have the following shape instead:
 *
 * `https://assets.aicoalesce.com/upload/converted/att_wtywhioyfurelljpivpbgdk3.pdf`
 *
 * so we don't slice when `compatStatus === "ACTIVE"`, we just take the top-level pathname as is
 */
function filenameToHexExtTuple(
  url: string,
  compatStatus: ("FAILED" | "PENDING" | "ACTIVE" | "ALIASED") | null
) {
  const urlObj = new URL(url);

  const path = urlObj.pathname;

  const pathname = path.slice(path.lastIndexOf("/") + 1);

  const filename = compatStatus === "ACTIVE" ? pathname : pathname.slice(14);

  const dbFile = filename ?? `file.pdf`;

  const withoutExt = dbFile.slice(0, dbFile.lastIndexOf("."));

  const ext = dbFile.slice(dbFile.lastIndexOf(".") + 1);

  return [Buffer.from(withoutExt, "utf-8").toString("hex"), ext] as const;
}

function toXaiFilename(att: AttachmentSingleton<true>) {
  let url = "";
  if (att.compatStatus === "ACTIVE" && att.compatCdnUrl) {
    url = att.compatCdnUrl;
  }
  if (att.compatStatus === "ALIASED" && att.cdnUrl) {
    url = att.cdnUrl;
  }
  const [filename, ext] = filenameToHexExtTuple(url, att.compatStatus);
  if (att.conversationId && att.messageId) {
    return `${att.conversationId}-${att.messageId}-${att.id}-${filename}.${ext}`;
  } else {
    throw new Error(`no conversationId or messageId set for ${att.id}`);
  }
}

async function fetchXai(att: AttachmentSingleton<true>, apiKey: string) {
  const { absTmpPath, tmpUniquename, mime, safeFilename } =
    await fetchRemoteToTmp(att);
  try {
    const F = new FormData();

    const arr = Array.of<Buffer>();
    const rs = createReadStream(absTmpPath);
    const iterate = rs.iterator() as NodeJS.AsyncIterator<
      Buffer,
      undefined,
      any
    >;
    for await (const o of iterate) {
      arr.push(o);
    }

    const buf = Buffer.concat(arr);

    const file = new File([buf], safeFilename, { type: mime });

    F.set("file", file, safeFilename);
    const { promise, resolve } = Promise.withResolvers<Response>();

    resolve(uploadFile(F, apiKey));

    return promise.then(res => res.json<UploadRT>());
  } catch (err) {
    console.error(safeErrMsg(err));
    throw new Error(safeErrMsg(err));
  } finally {
    cleanupTmpPostupload(absTmpPath, tmpUniquename);
  }
}

async function promoteToCollection(
  att: AttachmentSingleton<true>,
  collection_id: string,
  apiKey: string,
  management_api_key: string
) {
  const toFilename = toXaiFilename(att);
  const {
    attachmentId,
    conversationId,
    fileName: originalFilename,
    messageId
  } = parseFilename(toFilename);
  const res = await fetchXai(att, apiKey);
  if (!res?.id) throw new Error("no id returned with results");
  try {
    await fetch(
      `https://management-api.x.ai/v1/collections/${collection_id}/documents/${res.id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${management_api_key}`
        },
        body: JSON.stringify({
          fields: {
            conversationId,
            messageId,
            attachmentId,
            originalFilename
          }
        })
      }
    ).then(data => data.json());
  } catch (err) {
    throw new Error(safeErrMsg(err));
  } finally {
    return res;
  }
}
function canParseFilename(filename: string) {
  return /^(?:[a-z0-9]+-){3}[a-f0-9]+\.[a-z0-9]+$/.test(filename);
}

function parseFilename(filename: string) {
  if (!canParseFilename(filename))
    throw new Error(
      "always guard parseFilename with its canParseFilename helper!"
    );

  const [conversationId, messageId, attachmentId, fileNameExt] = filename.split(
    "-"
  ) as [string, string, string, string];

  const [fileNameHex, extension] = [
    fileNameExt.slice(0, fileNameExt.lastIndexOf(".")),
    fileNameExt.slice(fileNameExt.lastIndexOf(".") + 1)
  ];

  const fileName = Buffer.from(fileNameHex, "hex").toString("utf-8");

  return {
    conversationId,
    messageId,
    attachmentId,
    fileName,
    extension
  };
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

(async () => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const apiKey = await p.get("X_AI_KEY");
  const management_api_key = await p.get("X_AI_MANAGEMENT_API_KEY");
  const datasourceUrl = await p.get("DIRECT_URL");

  const ddd = (await data(
    datasourceUrl,
    12
  )) satisfies AttachmentSingleton<true>;
  const uploadThenPromote = await promoteToCollection(
    ddd,
    "collection_0ca753a0-e2fd-4050-a86f-dca114aa1a89",
    apiKey,
    management_api_key
  );
  return uploadThenPromote;
})().then(async v => {
  fs.withWs(
    `src/test/__out__/xai/files/upload.json`,
    JSON.stringify(v, null, 2)
  );
  return v;
});
