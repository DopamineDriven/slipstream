// import { relative } from "node:path";
import { relative } from "node:path";
import { Fs } from "@d0paminedriven/fs";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const genai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
  apiVersion: "v1alpha"
});

// (async () => {
//   const upload = await genai.files.upload({
//     file: relative(
//       process.cwd(),
//       "src/test/__out__/condensed/The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-III.md"
//     ),
//     config: {
//       mimeType: "text/markdown",
//       name: "files/Paved-with-Good-Intentions-Pt-III".toLowerCase()
//     }
//   });
//   return upload;
// })().then(v => {
//   console.log(v);
//   return v;
// });

const fs = new Fs(process.cwd());
// (async () => {
//   const displayName = "dev-nrr6h4r4480f6kviycyo1zhf";
//   const createFss = await genai.fileSearchStores.create({
//     config: { displayName }
//   });
//   const stringifyCreate = JSON.stringify(createFss, null, 2);
//   fs.withWs("src/test/__out__/google/fss/create.json", stringifyCreate);
//   console.log(stringifyCreate);
//   return createFss;
// })();
async function* listAllFss(pageSize = 20) {
  const pager = await genai.fileSearchStores.list({ config: { pageSize } });
  let has_more = true,
    count = 0,
    page_number = 0,
    page = pager.page;
  while (has_more) {
    has_more = pager.hasNextPage();
    count += page.length;

    yield {
      page,
      count,
      has_more,
      page_number
    };

    page_number += 1;
    if (!has_more) {
      break;
    }
    page = await pager.nextPage();
  }
}
async function _pullFssRecord() {
  const fssRecord = {
    hasStore: false,
    storeRef: "",
    storeDisplayName: "",
    createdAt: "",
    updatedAt: "",
    totalDocuments: 0
  };
  const displayName = "dev-nrr6h4r4480f6kviycyo1zhf";
  for await (const fss of listAllFss()) {
    for (const store of fss.page) {
      console.log(store);
      if (
        store.displayName &&
        store.name &&
        store.updateTime &&
        store.createTime
      ) {
        if (displayName === store.displayName) {
          fssRecord.hasStore = true;
          fssRecord.createdAt = store.createTime;
          fssRecord.totalDocuments = Number.parseInt("0");
          fssRecord.storeDisplayName = store.displayName;
          fssRecord.storeRef = store.name;
          fssRecord.updatedAt = store.updateTime;
        }
      }
    }
  }
  return fssRecord;
}

async function remoteToLocal(outputPath: string) {
  return await fs.fetchRemoteWriteLocalLargeFiles(
    "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1765624034329-Self-Imposed-Chains-Pt-II.pdf",
    outputPath,
    false
  );
}

async function googleUpload(meta: {
  displayName: string;
  attachmentId: string;
  conversationId: string;
  messageId: string;
  originalFilename: string;
}) {
  const outputPath = `src/test/google/fetched/${meta.originalFilename}`;
  try {
    await remoteToLocal(outputPath);
  } catch {
    //  err handle
  } finally {
    const filePath = relative(process.cwd(), outputPath);
    const uploadFile = await genai.files.upload({
      file: filePath,
      config: {
        name: `files/${meta.attachmentId}`,
        mimeType: "application/pdf",
        /**can be up to 512 chars in length */
        displayName: meta.displayName
      }
    });
    fs.withWs(
      `src/test/google/uploaded/files/${meta.attachmentId}.json`,
      JSON.stringify(uploadFile, null, 2)
    );
    return uploadFile;
  }
}

const _opsToDocsPathname = (o: string) => {
  return `${o.slice(0, o.lastIndexOf("/operations/"))}/documents/${o.slice(o.lastIndexOf("/") + 1)}`;
};

const fileSearchStoreName =
  "fileSearchStores/devnrr6h4r4480f6kviycyo1zhf-ms61ejujh04k";

async function promoteFile() {
  const meta = {
    displayName:
      "ddgx0syru0mkkomaqc0q6q4q-gvrs8oagxjfck0zld7kxenk8-ou06qqksfbt0vd9be6uv046f-53656c662d496d706f7365642d436861696e732d50742d4949.pdf",
    attachmentId: "ou06qqksfbt0vd9be6uv046f",
    conversationId: "ddgx0syru0mkkomaqc0q6q4q",
    messageId: "gvrs8oagxjfck0zld7kxenk8",
    originalFilename: "Self-Imposed-Chains-Pt-II.pdf"
  } as const;
  const uploadFile = await googleUpload(meta);
  const fileName = uploadFile.name;
  if (fileName) {
    const importFileParams = {
      fileName,
      fileSearchStoreName,
      config: {
        chunkingConfig: {
          whiteSpaceConfig: {
            maxTokensPerChunk: 512,
            maxOverlapTokens: 128
          }
        },
        customMetadata: [
          { key: "displayName", stringValue: meta.displayName },
          { key: "attachmentId", stringValue: meta.attachmentId },
          { key: "conversationId", stringValue: meta.conversationId },
          { key: "messageId", stringValue: meta.messageId },
          {
            key: "originalFilename",
            stringValue: meta.originalFilename
          }
        ] satisfies { key: string; stringValue: string }[]
      }
    } as const;
    let operation = await genai.fileSearchStores.importFile(importFileParams);

    while (!operation.done) {
      if (operation.error) {
        const safeErr = JSON.stringify(operation.error, null, 2);
        console.log(safeErr);
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await genai.operations.get({
        operation
      });
    }
    console.log({
      headers: operation.sdkHttpResponse?.headers
        ? JSON.stringify(operation.sdkHttpResponse.headers, null, 2)
        : null,
      name: operation.name ?? "no name",
      metadata: operation.metadata ?? "no metadata",
      response: {
        docName: operation.response?.documentName ?? "no DocName",
        parent: operation.response?.parent ?? "no parent"
      }
    });

    if (!operation.response?.documentName) throw new Error("no op name");
    const name =
      `${fileSearchStoreName}/documents/${operation.response.documentName}` as const;

    return await genai.fileSearchStores.documents.get({
      name
    });
  }
}
// fileSearchStores/devnrr6h4r4480f6kviycyo1zhf-ms61ejujh04k
(async () => {
  return await promoteFile();
})().then(res => {
  if (res?.name) {
    const toJson = JSON.stringify(res, null, 2);
    fs.withWs(`src/test/google/${res.name}.json`, toJson);
  }
});
