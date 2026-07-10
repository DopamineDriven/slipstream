import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const fs = new Fs(process.cwd());

const managementApiKey = process.env.X_AI_MANAGEMENT_API_KEY ?? "";

(async (userId: string) => {
  const fields = [
    {
      key: "conversationId",
      required: true,
      inject_into_chunk: false,
      unique: false,
      description: "Source conversation ID"
    },
    {
      key: "messageId",
      required: true,
      inject_into_chunk: false,
      unique: false,
      description: "Source message ID"
    },
    {
      key: "attachmentId",
      required: true,
      inject_into_chunk: false,
      unique: true, // Prevent duplicate uploads
      description: "Original attachment ID"
    },
    {
      key: "originalFilename",
      required: true,
      inject_into_chunk: true, // Helps with "which document said X?" queries
      unique: false,
      description: "Human-readable source filename"
    }
  ] as const;

  const body = {
    chunk_configuration: {
      inject_name_into_chunks: true,
      strip_whitespace: true,
      // ast_configuration: {
      //   encoding_name: "o200k_base",
      //   max_chunk_size_tokens: 1024
      // },
      // chars_configuration: {
      //   chunk_overlap_chars: 200,
      //   max_chunk_size_chars: 1024
      // },
      // code_chars_configuration: {
      //   chunk_overlap_chars: 200,
      //   max_chunk_size_chars: 1024
      // },
      // code_tokens_configuration: {
      //   chunk_overlap_tokens: 200,
      //   encoding_name: "o200k_base",
      //   max_chunk_size_tokens: 1024
      // },
      // markdown_chars_configuration: {
      //   chunk_overlap_chars: 200,
      //   max_chunk_size_chars: 1024
      // },
      // markdown_tokens_configuration: {
      //   chunk_overlap_tokens: 200,
      //   encoding_name: "o200k_base",
      //   max_chunk_size_tokens: 1024
      // },
      // table_configuration: {
      //   encoding_name: "o200k_base",
      //   max_chunk_size_tokens: 1024
      // },
      tokens_configuration: {
        chunk_overlap_tokens: 256,
        encoding_name: "o200k_base",
        max_chunk_size_tokens: 1024
      }
    },
    collection_name: `migrate-${userId}`,
    index_configuration: { model_name: "grok-embedding-small" },
    field_definitions: fields,
    metric_space: "HNSW_METRIC_COSINE"
  } as const;

  return await fetch("https://management-api.x.ai/v1/collections", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${managementApiKey}`
    },
    body: JSON.stringify(body)
  });
})("nrr6h4r4480f6kviycyo1zhf").then(async res => {
  const toJson = await res.json();
  fs.withWs(
    "src/test/__out__/xai/inspect/collection-create-payload-new.json",
    JSON.stringify(toJson, null, 2)
  );
  console.log(toJson);
});
