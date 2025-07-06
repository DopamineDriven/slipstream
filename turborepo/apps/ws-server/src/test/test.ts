import * as dotenv from "dotenv";
import { Credentials } from "@t3-chat-clone/credentials";
import { EncryptionService } from "@t3-chat-clone/encryption";

dotenv.config();

async function testingEncryption() {
  const cred = new Credentials();
  const myPersonalKey = await cred.get("OPENAI_API_KEY");

  const encryptionHandler = new EncryptionService();

  if (myPersonalKey) {
    return encryptionHandler.encryptText(myPersonalKey);
  } else return "no dice";
}

testingEncryption().then(res => {
  console.log(res);
  return res;
});
