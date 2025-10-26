export const getProductionUrl = "https://chat.aicoalesce.com" as const;

export const getPreviewUrl = "https://dev.chat.aicoalesce.com" as const;

export const getLocalUrl = "http://localhost:3030" as const;

export const getSiteUrl = (env?: "development" | "production" | "preview") => {
  if (!env) return getLocalUrl;
  else if (env === "production") return getProductionUrl;
  else if (env === "preview") return getPreviewUrl;
  else return getLocalUrl;
};
