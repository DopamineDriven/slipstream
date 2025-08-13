export interface CredentialEntity {
  JWT_SECRET?: string;
  REDIS_URL?: string;
  PORT?: string;
  MY_GITHUB_PAT?: string;
  R2_ACCOUNT_TOKEN?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_URL?: string;
  R2_EU_URL?: string;
  S3_API?: string;
  R2_BUCKET?: string;
  R2_PUBLIC_URL?: string;
  OPEN_AI_KEY?: string;
  OPENAI_API_KEY?: string;
  FASTAPI_URL?: string;
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
  PGHOST?: string;
  PGHOST_UNPOOLED?: string;
  PGUSER?: string;
  PGDATABASE?: string;
  PGPASSWORD?: string;
  POSTGRES_URL?: string;
  POSTGRES_URL_NON_POOLING?: string;
  POSTGRES_USER?: string;
  POSTGRES_HOST?: string;
  POSTGRES_PASSWORD?: string;
  POSTGRES_DATABASE?: string;
  POSTGRES_URL_NO_SSL?: string;
  POSTGRES_PRISMA_URL?: string;
  WS_HOSTNAME?: string;
  AWS_ACCESS_KEY?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  X_AI_KEY?: string;
  AWS_REGION?: string;
  AWS_SECRETS_ID?: string;
  ENCRYPTION_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  DATABASE_API_KEY?: string;
  REDIS_PASSWORD?: string;
  REDIS_USER?: string;
  REDIS_ID?: string;
  REDIS_NAME?: string;
  REDIS_HOST?: string;
  REDIS_CA_PEM?: string;
  REDIS_CLIENT_CERT?: string;
  REDIS_CLIENT_KEY?: string;
  RUNWAYML_API_SECRET?: string;
  ASSETS_BUCKET?: string;
  DIRECT_URL?: string;
  V0_API_KEY?: string;
  GEN_BUCKET?: string;
  MOTION_PLUS_PERSONAL_ACCESS_TOKEN?: string;
  LLAMA_API_KEY?: string;
}
export type CredentialsResult<T extends "success" | "failure" = "success"> =
  T extends "success"
    ? {
        [P in keyof CredentialEntity]-?: CredentialEntity[P];
      }
    : undefined;