**File:** `eslint.config.mjs`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/eslint.config.mjs).

```mjs

import baseConfig from "@t3-chat-clone/eslint-config/base";

/** @type {import('typescript-eslint').Config} */
export default [
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/require-await": "off",
      "prefer-const": "off"
    },
    ignores: ["dist/**"]
  }
];


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/eslint.config.mjs


---


**File:** `package.json`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/package.json).

```json

{
  "name": "@t3-chat-clone/credentials",
  "version": "1.0.0",
  "description": "convenient credentials util",
  "publishConfig": {
    "access": "public",
    "typesVersions": {
      "*": {
        "*": [
          "dist/*.d.ts",
          "dist/*/index.d.ts"
        ],
        "creds": [
          "dist/creds/index.d.ts"
        ],
        "types": ["dist/types/index.d.ts"]
      }
    }
  },
  "license": "MIT",
  "source": "src/index.ts",
  "typesVersions": {
    "*": {
      "*": [
        "dist/*.d.ts",
        "dist/*/index.d.ts"
      ],
        "creds": [
          "dist/creds/index.d.ts"
        ],
        "types": ["dist/types/index.d.ts"]
    }
  },
  "type": "module",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "files": [
    "dist/**/*.{js,cjs,d.ts,d.cts,css}"
  ],
  "exports": {
    ".": "./dist/index.js",
    "./*": "./dist/*.js",
    "./creds": "./dist/creds/index.js",
    "./types": "./dist/types/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "pnpm build",
    "lint": "eslint",
    "clean": "git clean -xdf .turbo dist node_modules",
    "fix": "npm pkg fix"
  },
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.839.0",
    "dotenv": "^17.0.0",
    "dotenv-expand": "^12.0.2"
  },
  "devDependencies": {
    "@d0paminedriven/fs": "^6.1.0",
    "@t3-chat-clone/eslint-config": "workspace:*",
    "@t3-chat-clone/prettier-config": "workspace:*",
    "@t3-chat-clone/tsconfig": "workspace:*",
    "@types/node": "^24.0.6",
    "chokidar": "^4.0.3",
    "dotenv-cli": "^8.0.0",
    "eslint": "^9.30.0",
    "jiti": "^2.4.2",
    "prettier": "^3.6.2",
    "terser": "^5.43.1",
    "tslib": "^2.8.1",
    "tsup": "^8.5.0",
    "tsx": "^4.20.3",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.35.0"
  },
  "prettier": "@t3-chat-clone/prettier-config"
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/package.json


---


**File:** `tsconfig.json`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/tsconfig.json).

```json

{
  "extends": "@t3-chat-clone/tsconfig/node-pkg.json",
    "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    },
    "tsBuildInfoFile": "node_modules/.cache/tsbuildinfo.json",
    "baseUrl": "./"
  },
  "include": [
    "**/*.ts",
    "src/**/*.ts",
    "**/*.mjs",
    "**/*.preset.ts",
    "tsup.config.ts"
  ],
  "exclude": ["dist"]
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/tsconfig.json


---


**File:** `tsup.config.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/tsup.config.ts).

```ts

import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

const tsupConfig = (options: Options) =>
  ({
    entry: [
      "src/index.ts",
      "src/creds/index.ts",
      "src/types/index.ts",
      "!src/test/**"
    ],
    target: ["node24"],
    dts: true,
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    format: ["esm"],
    sourcemap: true,
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: true,
    outDir: "dist",
    ...options
  }) satisfies Options;

export default defineConfig(tsupConfig);


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/tsup.config.ts


---


**File:** `turbo.json`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/turbo.json).

```json

{
  "extends": ["//"],
  "tasks": {
    "build": {
      "outputs": ["dist/**"]
    }
  }
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/turbo.json


---


**File:** `src/index.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/src/index.ts).

```ts

export type { CredentialEntity, CredentialsResult } from "@/types/index.ts";
export { Credentials } from "@/creds/index.ts";


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/src/index.ts


---


**File:** `src/creds/index.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/src/creds/index.ts).

```ts

import {
  GetSecretValueCommand,
  SecretsManagerClient
} from "@aws-sdk/client-secrets-manager";
import * as dotenv from "dotenv";
import type { CredentialsResult } from "@/types/index.ts";

dotenv.config();

export class Credentials {
  private client: SecretsManagerClient;

  private secretId?: string = "";

  private credsPromise?: Promise<CredentialsResult<"success">>;
  private cachedCreds?: CredentialsResult<"success">;

  constructor() {
    this.client = new SecretsManagerClient([
      {
        defaultsMode: "in-region",
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY ?? "",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ""
        }
      }
    ]);
    this.secretId = process.env.AWS_CREDENTIAL_SECRET_ID;
  }

  public async getAll(): Promise<CredentialsResult<"success">> {
    if (this.cachedCreds) {
      return this.cachedCreds;
    }

    if (this.credsPromise) {
      return this.credsPromise;
    }

    this.credsPromise = this.client
      .send(new GetSecretValueCommand({ SecretId: this.secretId }))
      .then(response => {
        if (!response.SecretString) {
          throw new Error("No SecretString returned");
        }
        const parsed = JSON.parse(
          response.SecretString
        ) as CredentialsResult<"success">;
        this.cachedCreds = parsed;
        return parsed;
      });

    return this.credsPromise;
  }
  public async get<const T extends keyof CredentialsResult<"success">>(
    target: T
  ) {
    return (await this.getAll())[target];
  }
}

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/src/creds/index.ts


---


**File:** `src/types/index.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/src/types/index.ts).

```ts

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
}

export type CredentialsResult<T extends "success" | "failure" = "success"> =
  T extends "success"
    ? {
        [P in keyof CredentialEntity]-?: CredentialEntity[P];
      }
    : undefined;



```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/src/types/index.ts


---

