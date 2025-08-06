import crypto from "node:crypto";
import type { EncryptedPayload } from "@/types/index.ts";
import * as dotenv from "dotenv";
import { Credentials } from "@t3-chat-clone/credentials";

dotenv.config({ quiet: true });

export class EncryptionService {
  #ALGO = "aes-256-gcm" as const;
  #IV_LENGTH = 16;
  #creds: Credentials;
  #masterKey?: Buffer;
  constructor(private encryptionKey = process.env.ENCRYPTION_KEY) {
    this.#creds = new Credentials();
  }

  private async getMasterKey() {
    // look in memory before fetching ENCRYPTION_KEY from aws secrets manager
    if (!this.#masterKey) {
      const encryptionKey =
        this.encryptionKey ?? (await this.#creds.get("ENCRYPTION_KEY"));

      if (encryptionKey.length < 64) throw new Error("Invalid ENCRYPTION_KEY");

      this.#masterKey = Buffer.from(encryptionKey, "hex");
    }
    return this.#masterKey;
  }

  public async encryptText(plaintext: string) {
    const key = await this.getMasterKey();

    const iv = crypto.randomBytes(this.#IV_LENGTH);

    const cipher = crypto.createCipheriv(this.#ALGO, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),

      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();
    return {
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      data: encrypted.toString("hex")
    };
  }

  public async decryptText(payload: EncryptedPayload) {
    const key = await this.getMasterKey();
    const iv = Buffer.from(payload.iv, "hex");
    const authTag = Buffer.from(payload.authTag, "hex");
    const data = Buffer.from(payload.data, "hex");

    const decipher = crypto.createDecipheriv(this.#ALGO, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

    return decrypted.toString("utf8");
  }
}
