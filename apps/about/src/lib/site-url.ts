export const getProductionUrl = "https://about.aicoalesce.com" as const;

export const getPreviewUrl = "https://dev.about.chat.aicoalesce.com" as const;

export const getLocalUrl = "http://localhost:3003" as const;

export const getSiteUrl = (env?: "development" | "production" | "preview") => {
  if (!env) return getLocalUrl;
  else if (env === "production") return getProductionUrl;
  else if (env === "preview") return getPreviewUrl;
  else return getLocalUrl;
};

export const getAnalyticsMode = (env?: "development" | "production" | "preview") => {
  if (!env) return "development" as const;
  else if (env === "production") return "production" as const;
  else if (env === "preview") return "production" as const;
  else return "auto" as const
};
