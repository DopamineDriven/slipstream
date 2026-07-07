import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const fs = new Fs(process.cwd());

const managementApiKey = process.env.X_AI_MANAGEMENT_API_KEY ?? "";
// nrr6h4r4480f6kviycyo1zhf
(async () => {
  return await fetch(
    "https://management-api.x.ai/v1/collections?filter=collection_name:dev-nrr6h4r4480f6kviycyo1zhf",
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managementApiKey}`
      }
    }
  );
})().then(async res => {
  const toJson = await res.json();

  fs.withWs(
    "src/test/__out__/xai/inspect/list-collections-with-filter.json",
    JSON.stringify(toJson, null, 2)
  );
});
