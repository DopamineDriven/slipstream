import type { CredentialsResult } from "@/types/index.ts";
import {
  GetSecretValueCommand,
  SecretsManagerClient
} from "@aws-sdk/client-secrets-manager";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

export class Credentials {
  #client: SecretsManagerClient;

  #secretId?: string = "";

  #credsPromise?: Promise<CredentialsResult<"success">>;
  #cachedCreds?: CredentialsResult<"success">;

  constructor() {
    this.#client = new SecretsManagerClient([
      {
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY ?? "",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ""
        }
      }
    ]);
    this.#secretId = process.env.AWS_CREDENTIAL_SECRET_ID;
  }

  public unflattenNewlines(s: string) {
    return s.replace(/\\n/g, "\n");
  }

  public async getAll(): Promise<CredentialsResult<"success">> {
    if (this.#cachedCreds) {
      return this.#cachedCreds;
    }

    if (this.#credsPromise) {
      return this.#credsPromise;
    }

    this.#credsPromise = this.#client
      .send(new GetSecretValueCommand({ SecretId: this.#secretId }))
      .then(response => {
        if (!response.SecretString) {
          throw new Error("No SecretString returned");
        }
        const parsed = JSON.parse(
          response.SecretString
        ) as CredentialsResult<"success">;
        this.#cachedCreds = parsed;
        return parsed;
      });

    return this.#credsPromise;
  }
  public async get<const T extends keyof CredentialsResult<"success">>(
    target: T
  ) {
    return (await this.getAll())[target];
  }
}
