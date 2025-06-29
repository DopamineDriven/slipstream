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


const x = () =>new Credentials().getAll().then((p) => {

  const oneLine = JSON.stringify(p)
console.log(oneLine);
return oneLine;
})

x();

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/packages/credentials-service/src/creds/index.ts


---

