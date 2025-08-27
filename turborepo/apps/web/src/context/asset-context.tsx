"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { nanoid } from "nanoid";
import type { EventTypeMap, ImageSpecs } from "@t3-chat-clone/types";

// Reuse your AttachmentPreview shape from your preview component
export type UploadStatus = "pending" | "uploading" | "uploaded" | "error";

export interface ClientAttachment {
  cid: string; // client id
  draftId: string;
  batchId: string; // composer-local bucket
  conversationId: string; // often "new-chat" before message exists
  file: File;
  filename: string;
  mime: string;
  size: number;
  status: UploadStatus;
  progress?: number; // 0-100
  // server linkage
  attachmentId?: string; // server id (after instructions)
  bucket?: string;
  key?: string;
  versionId?: string;
  etag?: string;
  // quick meta for UI
  width?: number;
  height?: number;
  metadata?: ImageSpecs;
  thumbnail?: string; // data URL
  error?: string;
}

// ---- State
interface State {
  // global registry by client id
  byCid: Record<string, ClientAttachment>;
  // per-batch list ordering
  byBatch: Record<string, string[]>; // batchId -> cid[]
  // FIFO queue for mapping instructions -> files within a batch
  pendingQueue: Record<string, string[]>; // batchId -> cid[]
  // preferred upload path (can be toggled per app or per batch later)
  uploadStrategy: "xhr" | "server";
}

const initial: State = {
  byCid: {},
  byBatch: {},
  pendingQueue: {},
  uploadStrategy: "xhr"
};

// ---- Actions
type Action =
  | { type: "BEGIN_BATCH"; batchId: string }
  | { type: "END_BATCH"; batchId: string }
  | { type: "ADD_ATTACHMENT"; att: ClientAttachment }
  | { type: "REMOVE_ATTACHMENT"; cid: string }
  | { type: "SET_PROGRESS"; cid: string; progress: number }
  | { type: "SET_STATUS"; cid: string; status: UploadStatus; error?: string }
  | {
      type: "SET_SERVER_LINK";
      cid: string;
      link: { attachmentId: string; bucket: string; key: string };
    }
  | { type: "SET_VERSION"; cid: string; versionId: string; etag?: string }
  | { type: "SET_THUMBNAIL"; cid: string; dataUrl: string }
  | { type: "SET_DIMENSIONS"; cid: string; width: number; height: number }
  | { type: "PUSH_PENDING"; batchId: string; cid: string }
  | { type: "SHIFT_PENDING"; batchId: string; expectCid?: string }
  | { type: "CLEAR_BATCH"; batchId: string }
  | { type: "SET_UPLOAD_STRATEGY"; strategy: "xhr" | "server" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "BEGIN_BATCH": {
      if (state.byBatch[action.batchId]) return state;
      return {
        ...state,
        byBatch: { ...state.byBatch, [action.batchId]: [] },
        pendingQueue: { ...state.pendingQueue, [action.batchId]: [] }
      };
    }
    case "END_BATCH": {
      return state; // placeholder for future logic
    }
    case "ADD_ATTACHMENT": {
      const { att } = action;
      const batchList = state.byBatch[att.batchId] ?? [];
      const pending = state.pendingQueue[att.batchId] ?? [];
      return {
        ...state,
        byCid: { ...state.byCid, [att.cid]: att },
        byBatch: { ...state.byBatch, [att.batchId]: [...batchList, att.cid] },
        pendingQueue: {
          ...state.pendingQueue,
          [att.batchId]: [...pending, att.cid]
        }
      };
    }
    case "REMOVE_ATTACHMENT": {
      const { cid } = action;
      const att = state.byCid[cid];
      if (!att) return state;
      const { batchId } = att;
      const byBatch = {
        ...state.byBatch,
        [batchId]: (state.byBatch[batchId] ?? []).filter(x => x !== cid)
      };
      const pendingQueue = {
        ...state.pendingQueue,
        [batchId]: (state.pendingQueue[batchId] ?? []).filter(x => x !== cid)
      };
      const byCid = { ...state.byCid };
      delete byCid[cid];
      return { ...state, byCid, byBatch, pendingQueue };
    }
    case "SET_PROGRESS": {
      const { cid, progress } = action;
      const cur = state.byCid[cid];
      if (!cur) return state;
      return {
        ...state,
        byCid: { ...state.byCid, [cid]: { ...cur, progress } }
      };
    }
    case "SET_STATUS": {
      const { cid, status, error } = action;
      const cur = state.byCid[cid];
      if (!cur) return state;
      return {
        ...state,
        byCid: { ...state.byCid, [cid]: { ...cur, status, error } }
      };
    }
    case "SET_SERVER_LINK": {
      const { cid, link } = action;
      const cur = state.byCid[cid];
      if (!cur) return state;
      return {
        ...state,
        byCid: { ...state.byCid, [cid]: { ...cur, ...link } }
      };
    }
    case "SET_VERSION": {
      const { cid, versionId, etag } = action;
      const cur = state.byCid[cid];
      if (!cur) return state;
      return {
        ...state,
        byCid: { ...state.byCid, [cid]: { ...cur, versionId, etag } }
      };
    }
    case "SET_THUMBNAIL": {
      const cur = state.byCid[action.cid];
      if (!cur) return state;
      return {
        ...state,
        byCid: {
          ...state.byCid,
          [action.cid]: { ...cur, thumbnail: action.dataUrl }
        }
      };
    }
    case "SET_DIMENSIONS": {
      const cur = state.byCid[action.cid];
      if (!cur) return state;
      return {
        ...state,
        byCid: {
          ...state.byCid,
          [action.cid]: { ...cur, width: action.width, height: action.height }
        }
      };
    }
    case "PUSH_PENDING": {
      const list = state.pendingQueue[action.batchId] ?? [];
      return {
        ...state,
        pendingQueue: {
          ...state.pendingQueue,
          [action.batchId]: [...list, action.cid]
        }
      };
    }
    case "SHIFT_PENDING": {
      const list = [...(state.pendingQueue[action.batchId] ?? [])];
      list.shift();
      return {
        ...state,
        pendingQueue: { ...state.pendingQueue, [action.batchId]: list }
      };
    }
    case "CLEAR_BATCH": {
      const cids = state.byBatch[action.batchId] ?? [];
      const byCid = { ...state.byCid };
      cids.forEach(cid => delete byCid[cid]);
      const byBatch = { ...state.byBatch };
      delete byBatch[action.batchId];
      const pendingQueue = { ...state.pendingQueue };
      delete pendingQueue[action.batchId];
      return { ...state, byCid, byBatch, pendingQueue };
    }
    case "SET_UPLOAD_STRATEGY": {
      return { ...state, uploadStrategy: action.strategy };
    }
    default:
      return state;
  }
}

// ---- Context API
interface AssetContextValue {
  state: State;
  beginBatch: (conversationId?: string) => string; // returns batchId
  destroyBatch: (batchId: string) => void;
  setUploadStrategy: (strategy: "xhr" | "server") => void;
  stageFiles: (
    batchId: string,
    files: File[],
    origin?: "PASTED" | "UPLOAD" | "SCREENSHOT"
  ) => void;
  remove: (cid: string) => void;
}

const AssetContext = createContext<AssetContextValue | null>(null);

export function AssetProvider({
  children,
  userId
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const [state, dispatch] = useReducer(reducer, initial);
  const { sendEvent, on, isConnected } = useChatWebSocketContext();
  const batchConvMap = useRef<Record<string, string>>({}).current;
  const batchOrdinals = useRef<Record<string, number>>({}).current;

  // Generate a batch id and bootstrap batch state
  const beginBatch = useCallback(
    (conversationId = "new-chat") => {
      const batchId = `batch_${nanoid(10)}`;
      dispatch({ type: "BEGIN_BATCH", batchId });
      // store a phantom placeholder to carry convId in the batch’s first item
      batchConvMap[batchId] = conversationId;
      batchOrdinals[batchId] = 0;
      return batchId;
    },
    [batchConvMap, batchOrdinals]
  );

  const destroyBatch = useCallback(
    (batchId: string) => {
      dispatch({ type: "CLEAR_BATCH", batchId });
      delete batchConvMap[batchId];
    },
    [batchConvMap]
  );

  const setUploadStrategy = useCallback((strategy: "xhr" | "server") => {
    dispatch({ type: "SET_UPLOAD_STRATEGY", strategy });
  }, []);

  // Local map for batch -> conversationId (kept out of React state to avoid extra renders)

  // Util: thumb + dimensions
  const hydrateThumbAndDims = useCallback((cid: string, file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) dispatch({ type: "SET_THUMBNAIL", cid, dataUrl });
      const img = new Image();
      img.onload = () => {
        dispatch({
          type: "SET_DIMENSIONS",
          cid,
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const stageFiles = useCallback(
    (
      batchId: string,
      files: File[],
      origin: "PASTED" | "UPLOAD" | "SCREENSHOT" = "UPLOAD"
    ) => {
      const conversationId = batchConvMap[batchId] ?? "new-chat";

      files.forEach((file, i) => {
        const cid = `cid_${nanoid(8)}`;
        const att: ClientAttachment = {
          cid,
          batchId,
          conversationId,draftId: `${userId}-${conversationId}-${batchId}-${i++}`,
          file,
          filename: file.name,
          mime: file.type,
          size: file.size,
          status: "pending"
        };
        dispatch({ type: "ADD_ATTACHMENT", att });
        hydrateThumbAndDims(cid, file);

        // ask server for presign
        if (!isConnected) return; // don’t queue WS if offline

        // Use dedicated event for paste vs generic prepare if you want; both lead to instructions
        if (origin === "PASTED") {
          sendEvent("asset_paste", {
            type: "asset_paste",
            conversationId,
            batchId,
            draftId: `${userId}~${conversationId}~${batchId}~${i++}` as const,
            filename:
              file.name ||
              `paste-${Date.now()}.${file.type.split("/")[1] ?? "bin"}`,
            mime: file.type,
            size: file.size
          } satisfies EventTypeMap["asset_paste"]);
        } else {
          sendEvent("asset_upload_prepare", {
            type: "asset_upload_prepare",
            conversationId,
            filename: file.name,
            batchId,
            draftId: `${userId}~${conversationId}~${batchId}~${i++}` as const,
            mime: file.type,
            size: file.size,
            origin
          } satisfies EventTypeMap["asset_upload_prepare"]);
        }
      });
    },
    [batchConvMap, hydrateThumbAndDims, isConnected, sendEvent, userId]
  );

  const remove = useCallback(
    (cid: string) => dispatch({ type: "REMOVE_ATTACHMENT", cid }),
    []
  );

  // ---- WS: handle instructions → perform upload → notify server
  useEffect(() => {
    return on("asset_upload_instructions", async evt => {
      if (evt.type === "asset_upload_instructions") {
        // FIFO mapping inside whichever batch queued next; this gets you e2e now
        const {
          conversationId,
          attachmentId,
          method,
          uploadUrl,
          requiredHeaders,
          bucket,
          key
        } = evt;

        // find a batch that matches the conversation and still has pending items
        const batchId = Object.keys(state.pendingQueue).find(
          b =>
            state.pendingQueue[b]?.length && batchConvMap[b] === conversationId
        );
        if (!batchId) return;
        const cid = state?.pendingQueue?.[batchId]?.[0];
        if (!cid) return;

        dispatch({
          type: "SET_SERVER_LINK",
          cid,
          link: { attachmentId, bucket, key }
        });
        dispatch({ type: "SET_STATUS", cid, status: "uploading" });

        const att = state.byCid[cid];
        if (!att) return;

        try {
          const startedAt = Date.now();
          const { versionId, etag, bytesUploaded } = await uploadToS3(
            {
              method,
              url: uploadUrl,
              file: att.file,
              headers: requiredHeaders
            },
            p => dispatch({ type: "SET_PROGRESS", cid, progress: p })
          );

          dispatch({ type: "SET_VERSION", cid, versionId, etag });

          const duration = Date.now() - startedAt;
          const publicUrl = makePublicUrl(bucket, key, versionId);

          // notify server
          sendEvent("asset_upload_complete", {
            type: "asset_upload_complete",
            conversationId,
            userId: "", // server can infer from ws auth; fill if you have it handy
            bucket,
            key,
            attachmentId,
            versionId,
            publicUrl,
            etag,
            success: true,
            duration,
            bytesUploaded
          } satisfies EventTypeMap["asset_upload_complete"]);
        } catch (err) {
          const _cur = state.byCid[cid];
          dispatch({
            type: "SET_STATUS",
            cid,
            status: "error",
            error: String(err)
          });
          sendEvent("asset_upload_complete_error", {
            type: "asset_upload_complete_error",
            conversationId,
            bucket,
            batchId,
            key,
            userId: "",
            attachmentId,
            error: String(err),
            success: false
          } satisfies EventTypeMap["asset_upload_complete_error"]);
        } finally {
          dispatch({ type: "SHIFT_PENDING", batchId });
        }
      }
    });
  }, [on, sendEvent, state.byCid, state.pendingQueue, batchConvMap]);

  // When server says READY, mark uploaded
  useEffect(() => {
    return on("asset_ready", evt => {
      if (evt.type === "asset_ready") {
        const { attachmentId } = evt;
        const cid = Object.values(state.byCid).find(
          a => a.attachmentId === attachmentId
        )?.cid;
        if (!cid) return;
        dispatch({ type: "SET_STATUS", cid, status: "uploaded" });
      }
    });
  }, [on, state.byCid]);

  const value = useMemo<AssetContextValue>(
    () => ({
      state,
      beginBatch,
      destroyBatch,
      setUploadStrategy,
      stageFiles,
      remove
    }),
    [state, beginBatch, destroyBatch, setUploadStrategy, stageFiles, remove]
  );

  return (
    <AssetContext.Provider value={value}>{children}</AssetContext.Provider>
  );
}

export function useAssetBatch(conversationId = "new-chat") {
  const ctx = useContext(AssetContext);
  if (!ctx)
    throw new Error("useAssetBatch must be used within <AssetProvider/>");

  // Lazily create a batch only once per hook usage
  const batchRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!batchRef.current) {
    batchRef.current = ctx.beginBatch(conversationId);
  }
  const batchId = batchRef.current;

  const attachments = (ctx.state.byBatch[batchId] ?? []).map(
    cid => ctx.state.byCid[cid]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        ctx.stageFiles(batchId, files, "PASTED");
      }
    },
    [batchId, ctx]
  );

  const addFiles = useCallback(
    (files: File[]) => ctx.stageFiles(batchId, files, "UPLOAD"),
    [batchId, ctx]
  );
  const remove = useCallback((cid: string) => ctx.remove(cid), [ctx]);
  const clear = useCallback(() => ctx.destroyBatch(batchId), [batchId, ctx]);

  return { batchId, attachments, onPaste, addFiles, remove, clear };
}

// ---- upload helper(s)
async function uploadToS3(
  opts: {
    method: "PUT" | "POST";
    url: string;
    file: File;
    headers?: Record<string, string>;
  },
  onProgress?: (p: number) => void
): Promise<{ versionId: string; etag?: string; bytesUploaded: number }> {
  // XHR for progress + headers
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method, opts.url, true);
    if (opts.headers) {
      for (const [k, v] of Object.entries(opts.headers))
        xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = ev => {
      if (!ev.lengthComputable) return;
      const p = Math.round((ev.loaded / ev.total) * 100);
      onProgress?.(p);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const v = xhr.getResponseHeader("x-amz-version-id");
        if (!v) return reject(new Error("Missing x-amz-version-id header"));
        const etag = (xhr.getResponseHeader("ETag") ?? "").replaceAll('"', "");
        resolve({
          versionId: v,
          etag: etag || undefined,
          bytesUploaded: opts.file.size
        });
      } else {
        reject(new Error(`S3 upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during S3 upload"));
    xhr.send(opts.file);
  });
}

function makePublicUrl(bucket: string, key: string, versionId: string) {
  // If you front with CF, swap this out
  const base = `https://${bucket}.s3.amazonaws.com/${encodeURIComponent(key)}`;
  return `${base}?versionId=${encodeURIComponent(versionId)}`;
}
