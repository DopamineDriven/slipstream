import type { $Enums } from "@slipstream/db/node/generated/client";

export type MaybePromise<T> = T | Promise<T>;

export interface UrlExtWorkupProps {
  id: string;
  compatStatus: $Enums.CompatStatus | null;
  ext: string | null;
  compatExt: string | null;
  cdnUrl: string | null;
  compatCdnUrl: string | null;
  mime: string | null;
  compatMime: string | null;
}

export interface AssetToTmpWorkupProps extends UrlExtWorkupProps {
  userId: string;
  conversationId: string | null;
  messageId: string | null;
  assetType: $Enums.AssetType;
}

export type XAIReturnedDocMetadata = {
  file_id: string;
  name: string;
  size_bytes: number;
  content_type: string;
  created_at_nanos: number;
  created_at: number; // unix timestamp (seconds)
  hash: string;
  status: number;
  error: undefined;
};

export type GlobalDictProps = {
  upload_result: Promise<XAIReturnedDocMetadata>;
};

export type PythonExecType = (
  uploadScript: string,
  global_dict: {
    upload_result: Promise<XAIReturnedDocMetadata>;
  }
) => MaybePromise<unknown>;

export type PythonGlobalsType = () => Promise<GlobalDictProps>;

export type PythonBuiltIns = {
  exec: Promise<PythonExecType>;
  globals: Promise<PythonGlobalsType>;
};
