import type { AttachmentSingleton, DocumentSingleton } from "@/types/index.ts";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

export type AccessTokenResProps = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export class AdobeTest {
  /**
   * key -> clientId
   */
  private bearerMap = new Map<
    string,
    { access_token: string; expiresAt: number }
  >();
  constructor(
    private clientId: string,
    private clientSecret: string
  ) {}

  public async getAdobeAccessToken() {
    const cached = this.bearerMap.get(this.clientId);
    if (cached?.expiresAt && cached?.expiresAt - Date.now() >= 60000) {
      return { access_token: cached.access_token, expiresAt: cached.expiresAt };
    } else {
      const res = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
        body: new URLSearchParams([
          ["grant_type", "client_credentials"],
          ["client_id", this.clientId],
          ["client_secret", this.clientSecret],
          ["scope", "openid,AdobeID,DCAPI"]
        ])
      });
      if (!res.ok) {
        throw new Error(`Adobe auth failed: ${res.status}`);
      }
      const payload = await res.json<AccessTokenResProps>();
      this.bearerMap.set(this.clientId, {
        access_token: payload.access_token,
        expiresAt: Date.now() + payload.expires_in * 1000
      });
      return {
        access_token: payload.access_token,
        expiresAt: Date.now() + payload.expires_in * 1000
      };
    }
  }
}

const _x = () =>
  (async () => {
    const { Credentials } = await import("@slipstream/credentials");
    const cfg = new Credentials();

    const [id, secret] = await Promise.all([
      cfg.get("PDF_SERVICES_CLIENT_ID"),
      cfg.get("PDF_SERVICES_CLIENT_SECRET")
    ]);
    const adobe = new AdobeTest(id, secret);

    const auth = await adobe.getAdobeAccessToken();
    return auth;
  })().then(data => {
    console.log(data);
    return data;
  });
type AssetRT =
  | ({ document: DocumentSingleton | null } & Omit<
      AttachmentSingleton,
      "image"
    >)
  | null;

const _asset = () =>
  (async () => {
    const { PrismaClient } = await import("@/generated/client/client.ts");
    const { Credentials } = await import("@slipstream/credentials");
    const cfg = new Credentials();
    const [datasourceUrl, _direct] = await Promise.all([
      cfg.get("DATABASE_URL"),
      cfg.get("DIRECT_URL")
    ]);
    const prisma = new PrismaClient({ datasourceUrl });
    let asset: AssetRT = null;
    try {
      prisma.$connect();
      asset = await prisma.attachment.findUnique({
        where: { id: "niggfu0z0og5g4rvof330g84" },
        include: { document: true }
      });
    } catch (err) {
      console.log(err);
    } finally {
      prisma.$disconnect();
      return asset;
    }
  })().then(t => {
    console.log(t);
    return t;
  });
