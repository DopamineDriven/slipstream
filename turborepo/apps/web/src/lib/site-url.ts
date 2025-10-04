export const getProductionUrl = "https://chat.aicoalesce.com" as const;

export const getPreviewUrl = "https://dev.chat.aicoalesce.com" as const;

export const getLocalUrl = "http://localhost:3030" as const;

export const envMediatedBaseUrl = (env: typeof process.env.NODE_ENV) =>
  process.env.VERCEL_ENV === "development" ||
  process.env.VERCEL_ENV === "preview"
    ? getPreviewUrl
    : env === "development"
      ? getLocalUrl
      : env === "production" || process.env.VERCEL_ENV === "production"
        ? getProductionUrl
        : env === "test"
          ? getLocalUrl
          : getPreviewUrl;

export const getSiteUrl = (env?: "development" | "production" | "preview") => {
  console.log({
    vercelTargetEnv: process.env.VERCEL_TARGET_ENV ?? "",
    vercelUrl: process.env.VERCEL_URL ?? "",
    vercelEnv: process.env.VERCEL_ENV ?? "development"
  });
  if (!env) return getLocalUrl;
  else if (env === "production") return getProductionUrl;
  else if (env === "preview") return getPreviewUrl;
  else return getLocalUrl;
};
