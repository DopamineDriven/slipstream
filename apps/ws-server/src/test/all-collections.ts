import { ListCollectionsResponse } from "@/xai/types.ts";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });
const xaiManagementKey = process.env.X_AI_MANAGEMENT_API_KEY ?? "";
async function* getAllCollections(limit = 10, mgmtKey = xaiManagementKey) {
  let has_more = true;
  let count = 0;
  let pagination_token: string | undefined = undefined;
  let page_number = 0;

  while (has_more) {
    const url = pagination_token
      ? `https://management-api.x.ai/v1/collections?limit=${limit}&pagination_token=${pagination_token}`
      : `https://management-api.x.ai/v1/collections?limit=${limit}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mgmtKey}`
      }
    });

    const page = await response.json<ListCollectionsResponse>();

    has_more = typeof page.pagination_token !== "undefined";
    pagination_token = page.pagination_token;
    count += page.collections?.length ?? 0;

    yield {
      data: page.collections,
      count,
      page_number,
      has_more
    };

    page_number += 1;
  }
}
async function pullCollectionRecord(key = xaiManagementKey) {
  const userId = "nrr6h4r4480f6kviycyo1zhf";
  const displayName = `dev-${userId}`;
  for await (const collection of getAllCollections(10, key)) {
    for (const store of collection.data) {
      if (store.collection_id && store.collection_name) {
        if (displayName === store.collection_name) {
          return {
            hasStore: true,
            store
          } as const;
        }
      }
    }
  }
  return {
    hasStore: false,
    store: undefined
  } as const;
}

pullCollectionRecord().then(res => {
  const toJSON = JSON.stringify(res, null, 2);
  console.log(toJSON);
  return toJSON;
});
