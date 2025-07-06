export interface EncryptedPayload {
  iv: string;
  authTag: string;
  data: string;
}
